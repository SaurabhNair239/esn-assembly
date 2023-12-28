///
/// IMPORTS
///

import { DynamoDB, RCError, ResourceController } from 'idea-aws';

import { addBadgeToUser } from './badges';
import { addStatisticEntry } from './statistics';

import { TopicCategoryAttached } from '../models/category.model';
import { GAEventAttached } from '../models/event.model';
import { Topic } from '../models/topic.model';
import { RelatedTopic } from '../models/relatedTopic.model';
import { User } from '../models/user.model';
import { Badges } from '../models/userBadge.model';
import { SubjectTypes } from '../models/subject.model';
import { StatisticEntityTypes } from '../models/statistic.model';

///
/// CONSTANTS, ENVIRONMENT VARIABLES, HANDLER
///

const PROJECT = process.env.PROJECT;
const DDB_TABLES = {
  topics: process.env.DDB_TABLE_topics,
  relatedTopics: process.env.DDB_TABLE_relatedTopics,
  categories: process.env.DDB_TABLE_categories,
  events: process.env.DDB_TABLE_events,
  messagesUpvotes: process.env.DDB_TABLE_messagesUpvotes
};
const ddb = new DynamoDB();

export const handler = (ev: any, _: any, cb: any): Promise<void> => new Topics(ev, cb).handleRequest();

///
/// RESOURCE CONTROLLER
///

class Topics extends ResourceController {
  galaxyUser: User;
  topic: Topic;

  constructor(event: any, callback: any) {
    super(event, callback, { resourceId: 'topicId' });
    this.galaxyUser = new User(event.requestContext.authorizer.lambda.user);
  }

  protected async checkAuthBeforeRequest(): Promise<void> {
    if (!this.resourceId) return;

    try {
      this.topic = new Topic(await ddb.get({ TableName: DDB_TABLES.topics, Key: { topicId: this.resourceId } }));
    } catch (err) {
      throw new RCError('Topic not found');
    }
  }

  protected async getResources(): Promise<Topic[]> {
    let topics: Topic[] = await ddb.scan({ TableName: DDB_TABLES.topics });
    topics = topics.map(x => new Topic(x));

    if (!this.galaxyUser.isAdministrator) topics = topics.filter(x => !x.isDraft());

    if (this.queryParams.archived !== undefined) {
      const archived = this.queryParams.archived !== 'false';
      topics = topics.filter(x => (archived ? x.isArchived() : !x.isArchived()));
    }
    if (this.queryParams.categoryId) topics = topics.filter(x => x.category.categoryId === this.queryParams.categoryId);
    if (this.queryParams.eventId) topics = topics.filter(x => x.event.eventId === this.queryParams.eventId);

    topics = topics.sort((a, b): number => b.createdAt.localeCompare(a.createdAt));

    await addStatisticEntry(this.galaxyUser, StatisticEntityTypes.TOPICS);

    return topics;
  }

  private async putSafeResource(opts: { noOverwrite: boolean }): Promise<Topic> {
    const errors = this.topic.validate();
    if (errors.length) throw new RCError(`Invalid fields: ${errors.join(', ')}`);

    try {
      this.topic.category = new TopicCategoryAttached(
        await ddb.get({ TableName: DDB_TABLES.categories, Key: { categoryId: this.topic.category.categoryId } })
      );
    } catch (error) {
      throw new RCError('Category not found');
    }

    try {
      this.topic.event = new GAEventAttached(
        await ddb.get({ TableName: DDB_TABLES.events, Key: { eventId: this.topic.event.eventId } })
      );
    } catch (error) {
      throw new RCError('Event not found');
    }

    const putParams: any = { TableName: DDB_TABLES.topics, Item: this.topic };
    if (opts.noOverwrite) putParams.ConditionExpression = 'attribute_not_exists(topicId)';
    else this.topic.updatedAt = new Date().toISOString();

    await ddb.put(putParams);

    return this.topic;
  }

  protected async postResources(): Promise<Topic> {
    if (!this.galaxyUser.isAdministrator) throw new RCError('Unauthorized');

    this.topic = new Topic(this.body);
    this.topic.topicId = await ddb.IUNID(PROJECT);
    delete this.topic.updatedAt;
    delete this.topic.numOfQuestions;

    await this.putSafeResource({ noOverwrite: true });

    const userSubjects = this.topic.subjects.filter(s => s.type === SubjectTypes.USER);
    for (const user of userSubjects) await addBadgeToUser(ddb, user.id, Badges.RISING_STAR);

    return this.topic;
  }

  protected async getResource(): Promise<Topic> {
    if (this.topic.isDraft() && !this.galaxyUser.isAdministrator) throw new RCError('Unauthorized');

    await addStatisticEntry(this.galaxyUser, StatisticEntityTypes.TOPICS, this.resourceId);

    return this.topic;
  }

  protected async putResource(): Promise<Topic> {
    if (!this.galaxyUser.isAdministrator) throw new RCError('Unauthorized');

    const oldTopic = new Topic(this.topic);
    this.topic.safeLoad(this.body, oldTopic);

    return await this.putSafeResource({ noOverwrite: false });
  }

  protected async patchResource(): Promise<Topic | string[]> {
    switch (this.body.action) {
      case 'OPEN':
        return await this.manageStatus(true);
      case 'CLOSE':
        return await this.manageStatus(false);
      case 'ARCHIVE':
        return await this.manageArchive(true);
      case 'UNARCHIVE':
        return await this.manageArchive(false);
      case 'MESSAGES_UPVOTES':
        return await this.getMessagesIdsUpvotedByUser();
      default:
        throw new RCError('Unsupported action');
    }
  }
  private async manageStatus(open: boolean): Promise<Topic> {
    if (!this.galaxyUser.isAdministrator) throw new RCError('Unauthorized');

    if (open) delete this.topic.closedAt;
    else this.topic.closedAt = new Date().toISOString();

    await ddb.put({ TableName: DDB_TABLES.topics, Item: this.topic });
    return this.topic;
  }
  private async manageArchive(archive: boolean): Promise<Topic> {
    if (!this.galaxyUser.isAdministrator) throw new RCError('Unauthorized');

    if (archive) {
      this.topic.archivedAt = new Date().toISOString();
      if (!this.topic.closedAt) this.topic.closedAt = this.topic.archivedAt;
    } else delete this.topic.archivedAt;

    await ddb.put({ TableName: DDB_TABLES.topics, Item: this.topic });
    return this.topic;
  }
  private async getMessagesIdsUpvotedByUser(): Promise<string[]> {
    const messagesUpvoted = await ddb.query({
      TableName: DDB_TABLES.messagesUpvotes,
      IndexName: 'topicId-userId-index',
      KeyConditionExpression: 'topicId = :topicId AND userId = :userId',
      ExpressionAttributeValues: { ':topicId': this.topic.topicId, ':userId': this.galaxyUser.userId }
    });
    return messagesUpvoted.map(x => x.messageId);
  }

  protected async deleteResource(): Promise<void> {
    if (!this.galaxyUser.isAdministrator) throw new RCError('Unauthorized');

    const topics: RelatedTopic[] = await ddb.query({
      TableName: DDB_TABLES.relatedTopics,
      KeyConditionExpression: 'topicA = :topicId',
      ExpressionAttributeValues: { ':topicId': this.topic.topicId }
    });
    if (topics.length > 0) throw new RCError('Unlink related topics first');

    await ddb.delete({ TableName: DDB_TABLES.topics, Key: { topicId: this.topic.topicId } });
  }
}
