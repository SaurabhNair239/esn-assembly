///
/// IMPORTS
///

import { DynamoDB, HandledError, ResourceController, SES } from 'idea-aws';

import { isEmailInBlockList } from './sesNotifications';
import { addBadgeToUser } from './usersBadges';

import { Topic, TopicTypes } from '../models/topic.model';
import { Question } from '../models/question.model';
import { Answer } from '../models/answer.model';
import { User } from '../models/user.model';
import { BuiltInBadges } from '../models/badge.model';
import { Subject } from '../models/subject.model';
import { Configurations } from '../models/configurations.model';

///
/// CONSTANTS, ENVIRONMENT VARIABLES, HANDLER
///

const PROJECT = process.env.PROJECT;
const STAGE = process.env.STAGE;
const APP_DOMAIN = process.env.APP_DOMAIN;
const DDB_TABLES = {
  questions: process.env.DDB_TABLE_questions,
  topics: process.env.DDB_TABLE_topics,
  answers: process.env.DDB_TABLE_answers,
  answersClaps: process.env.DDB_TABLE_answersClaps,
  configurations: process.env.DDB_TABLE_configurations
};
const ddb = new DynamoDB();

const QUESTION_BASE_URL = `https://${APP_DOMAIN}/t/topics/`;
const SES_CONFIG = {
  source: process.env.SES_SOURCE_ADDRESS,
  sourceArn: process.env.SES_IDENTITY_ARN,
  region: process.env.SES_REGION
};
const ses = new SES();

export const handler = (ev: any, _: any, cb: any): Promise<void> => new Questions(ev, cb).handleRequest();

///
/// RESOURCE CONTROLLER
///

class Questions extends ResourceController {
  galaxyUser: User;
  topic: Topic;
  question: Question;

  constructor(event: any, callback: any) {
    super(event, callback, { resourceId: 'questionId' });
    this.galaxyUser = new User(event.requestContext.authorizer.lambda.user);
  }

  protected async checkAuthBeforeRequest(): Promise<void> {
    try {
      this.topic = new Topic(
        await ddb.get({ TableName: DDB_TABLES.topics, Key: { topicId: this.pathParameters.topicId } })
      );
    } catch (err) {
      throw new HandledError('Topic not found');
    }

    if (this.topic.type !== TopicTypes.STANDARD) throw new HandledError('Incompatible type of topic');

    if (!this.resourceId) return;

    try {
      this.question = new Question(
        await ddb.get({
          TableName: DDB_TABLES.questions,
          Key: { topicId: this.pathParameters.topicId, questionId: this.resourceId }
        })
      );
    } catch (err) {
      throw new HandledError('Question not found');
    }
  }

  protected async getResources(): Promise<Question[]> {
    let questions: Question[] = await ddb.query({
      TableName: DDB_TABLES.questions,
      KeyConditionExpression: 'topicId = :topicId',
      ExpressionAttributeValues: { ':topicId': this.topic.topicId }
    });
    questions = questions.map(x => new Question(x));
    return questions.sort((a, b): number => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  }

  private async putSafeResource(opts: { noOverwrite: boolean }): Promise<Question> {
    const errors = this.question.validate();
    if (errors.length) throw new HandledError(`Invalid fields: ${errors.join(', ')}`);

    const putParams: any = { TableName: DDB_TABLES.questions, Item: this.question };
    if (opts.noOverwrite)
      putParams.ConditionExpression = 'attribute_not_exists(topicId) AND attribute_not_exists(questionId)';
    await ddb.put(putParams);

    return this.question;
  }

  protected async postResources(): Promise<Question> {
    if (!this.topic.canUserInteract(this.galaxyUser)) throw new Error('Not allowed to interact');

    const { bannedUsersIds } = new Configurations(
      await ddb.get({ TableName: DDB_TABLES.configurations, Key: { PK: Configurations.PK } })
    );
    if (bannedUsersIds.includes(this.galaxyUser.userId)) throw new Error('User is banned');

    this.question = new Question(this.body);
    this.question.topicId = this.topic.topicId;
    this.question.questionId = await ddb.IUNID(PROJECT);
    this.question.creator = Subject.fromUser(this.galaxyUser);
    this.question.createdAt = new Date().toISOString();

    await this.putSafeResource({ noOverwrite: true });

    const numQuestionsForTopic = (await this.getResources()).length;
    await this.updateCountersOfTopic(numQuestionsForTopic);

    await this.sendNotificationToTopicSubjects(this.topic, this.question);

    await addBadgeToUser(ddb, this.galaxyUser.userId, BuiltInBadges.FIRST_QUESTION);
    if ((await this.getNumQuestionsMadeByUser()) >= 10)
      await addBadgeToUser(ddb, this.galaxyUser.userId, BuiltInBadges.QUESTIONS_MASTER);
    if (numQuestionsForTopic === 1) await addBadgeToUser(ddb, this.galaxyUser.userId, BuiltInBadges.FIRST_DANCE);

    return this.question;
  }

  protected async getResource(): Promise<Question> {
    return this.question;
  }

  protected async putResource(): Promise<Question> {
    if (!this.question.canUserEdit(this.topic, this.galaxyUser)) throw new HandledError('Unauthorized');

    if (await this.questionHasAnswers()) throw new HandledError('Question has answers');

    const oldQuestion = new Question(this.question);
    this.question.safeLoad(this.body, oldQuestion);
    this.question.updatedAt = new Date().toISOString();

    return await this.putSafeResource({ noOverwrite: false });
  }

  protected async patchResource(): Promise<Question | { upvoted: boolean } | string[]> {
    switch (this.body.action) {
      case 'USER_CLAPS':
        return await this.getAnswersIdsClappedByUser();
      default:
        throw new HandledError('Unsupported action');
    }
  }

  private async getAnswersIdsClappedByUser(): Promise<string[]> {
    const answersClapped = await ddb.query({
      TableName: DDB_TABLES.answersClaps,
      IndexName: 'questionId-userId-index',
      KeyConditionExpression: 'questionId = :questionId AND userId = :userId',
      ExpressionAttributeValues: { ':questionId': this.question.questionId, ':userId': this.galaxyUser.userId }
    });
    return answersClapped.map(x => x.answerId);
  }

  protected async deleteResource(): Promise<void> {
    if (!this.question.canUserEdit(this.topic, this.galaxyUser)) throw new HandledError('Unauthorized');

    if (await this.questionHasAnswers()) throw new HandledError('Question has answers');

    await ddb.delete({
      TableName: DDB_TABLES.questions,
      Key: { topicId: this.topic.topicId, questionId: this.question.questionId }
    });

    await this.updateCountersOfTopic((await this.getResources()).length);
  }

  private async questionHasAnswers(): Promise<boolean> {
    const answersToQuestion: Answer[] = await ddb.query({
      TableName: DDB_TABLES.answers,
      KeyConditionExpression: 'questionId = :questionId',
      ExpressionAttributeValues: { ':questionId': this.question.questionId }
    });
    return answersToQuestion.length > 0;
  }
  private async updateCountersOfTopic(numOfQuestionsInTopic: number): Promise<void> {
    try {
      await ddb.update({
        TableName: DDB_TABLES.topics,
        Key: { topicId: this.topic.topicId },
        UpdateExpression: 'SET numOfQuestions = :num',
        ExpressionAttributeValues: { ':num': numOfQuestionsInTopic }
      });
    } catch (error) {
      this.logger.warn('Counters not updated', error, { topicId: this.topic.topicId });
    }
  }

  private async sendNotificationToTopicSubjects(topic: Topic, question: Question): Promise<void> {
    const subjectsToNotify = topic.subjects.filter(x => !!x.email);
    const template = `notify-new-question-${STAGE}`;
    for (const subject of subjectsToNotify) {
      const templateData = {
        user: subject.name,
        title: topic.name,
        detail: question.summary,
        url: QUESTION_BASE_URL.concat(topic.topicId)
      };
      const { appTitle } = await ddb.get({ TableName: DDB_TABLES.configurations, Key: { PK: Configurations.PK } });
      const sesConfig = { ...SES_CONFIG, sourceName: appTitle };
      if (!(await isEmailInBlockList(question.creator.email)))
        await ses.sendTemplatedEmail({ toAddresses: [subject.email], template, templateData }, sesConfig);
    }
  }

  private async getNumQuestionsMadeByUser(): Promise<number> {
    try {
      const questions = await ddb.scan({
        TableName: DDB_TABLES.questions,
        ProjectionExpression: 'creator',
        FilterExpression: 'creator.id = :userId',
        ExpressionAttributeValues: { ':userId': this.galaxyUser.userId }
      });
      return questions.length;
    } catch (error) {
      return 0;
    }
  }
}
