import { Component, Input } from '@angular/core';
import { AlertController, IonInfiniteScroll, IonRefresher } from '@ionic/angular';
import { toCanvas } from 'qrcode';
import { Attachment } from 'idea-toolbox';
import {
  IDEAActionSheetController,
  IDEALoadingService,
  IDEAMessageService,
  IDEATranslationsService
} from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { TopicsService } from './topics.service';
import { AttachmentsService } from '@app/common/attachments.service';
import { MessagesService, MessagesSortBy } from './messages/messages.service';
import { ConfigurationsService } from '../configurations/configurations.service';

import { environment as env } from '@env';
import { Topic, TopicTypes } from '@models/topic.model';
import { Message, MessageTypes } from '@models/message.model';
import { Subject } from '@models/subject.model';
import { FAVORITE_TIMEZONE } from '@models/favoriteTimezone.const';

@Component({
  selector: 'live-topic',
  templateUrl: 'liveTopic.page.html',
  styleUrls: ['liveTopic.page.scss']
})
export class LiveTopicPage {
  @Input() topicId: string;
  topic: Topic;

  questions: Message[];
  showCompletedQuestions = false;
  sortQuestionsBy = MessagesSortBy.CREATION_ASC;

  appreciations: Message[];
  showCompletedAppreciations = false;
  sortAppreciationsBy = MessagesSortBy.CREATION_DESC;

  MessageTypes = MessageTypes;
  MessagesSortBy = MessagesSortBy;
  newMessage: Message;
  errors = new Set<string>();

  FAVORITE_TIMEZONE = FAVORITE_TIMEZONE;

  relatedTopics: Topic[];

  showTopicDetails: boolean;
  segment = MessageTypes.QUESTION;
  fullScreen = false;

  hideQuestions = false;
  hideAppreciations = false;

  constructor(
    private alertCtrl: AlertController,
    private actionsCtrl: IDEAActionSheetController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private t: IDEATranslationsService,
    private _topics: TopicsService,
    private _attachments: AttachmentsService,
    private _messages: MessagesService,
    private _configurations: ConfigurationsService,
    public app: AppService
  ) {}
  async ionViewWillEnter(): Promise<void> {
    try {
      await this.loading.show();
      await this.loadResources();
      this.showTopicDetails = !this.app.isInMobileMode();
    } catch (error) {
      this.message.error('COMMON.NOT_FOUND');
    } finally {
      this.loading.hide();
    }
  }
  private async loadResources(): Promise<void> {
    this.topic = await this._topics.getById(this.topicId);
    [, this.relatedTopics] = await Promise.all([
      this._messages.getListOfTopic(this.topic),
      this._topics.getRelated(this.topic)
    ]);
    await this.filterQuestions();
    await this.filterAppreciations();
  }
  async handleRefresh(refresh: IonRefresher): Promise<void> {
    this.questions = null;
    this.appreciations = null;
    await this.loadResources();
    refresh.complete();
  }

  manageTopic(): void {
    this.app.goToInTabs(['topics', this.topic.topicId, 'manage']);
  }

  async downloadAttachment(attachment: Attachment): Promise<void> {
    try {
      await this.loading.show();
      const url = await this._attachments.download(attachment);
      await this.app.openURL(url);
    } catch (error) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }

  async filterQuestions(scrollToNextPage?: IonInfiniteScroll, force = false): Promise<void> {
    let startPaginationAfterId = null;
    if (scrollToNextPage && this.questions?.length)
      startPaginationAfterId = this.questions[this.questions.length - 1].messageId;

    this.questions = await this._messages.getListOfTopic(this.topic, {
      force,
      filterByType: MessageTypes.QUESTION,
      showCompleted: this.topic.isClosed() ? true : this.showCompletedQuestions,
      sortBy: this.sortQuestionsBy,
      withPagination: true,
      startPaginationAfterId
    });

    if (scrollToNextPage) setTimeout((): Promise<void> => scrollToNextPage.complete(), 100);
  }
  async filterAppreciations(scrollToNextPage?: IonInfiniteScroll, force = false): Promise<void> {
    let startPaginationAfterId = null;
    if (scrollToNextPage && this.appreciations?.length)
      startPaginationAfterId = this.appreciations[this.appreciations.length - 1].messageId;

    this.appreciations = await this._messages.getListOfTopic(this.topic, {
      force,
      filterByType: MessageTypes.APPRECIATION,
      showCompleted: this.topic.isClosed() ? true : this.showCompletedAppreciations,
      sortBy: this.sortAppreciationsBy,
      withPagination: true,
      startPaginationAfterId
    });

    if (scrollToNextPage) setTimeout((): Promise<void> => scrollToNextPage.complete(), 100);
  }

  startNewMessage(appreciation = false): void {
    this.newMessage = new Message({
      topicId: this.topic.topicId,
      creator: Subject.fromUser(this.app.user),
      type: appreciation ? MessageTypes.APPRECIATION : MessageTypes.QUESTION
    });
  }

  handleMessageMarkedAnonymous(anonymous: boolean): void {
    if (anonymous) delete this.newMessage.creator;
    else this.newMessage.creator = Subject.fromUser(this.app.user);
  }

  async cancelNewMessage(): Promise<void> {
    const doCancel = (): void => {
      this.errors = new Set();
      this.newMessage = null;
    };

    if (!this.newMessage.summary && !this.newMessage.text) return doCancel();

    const header = this.t._('COMMON.ARE_YOU_SURE');
    const message = this.t._('MESSAGES.YOU_WILL_LOSE_THE_CONTENT');
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.CONFIRM'), role: 'destructive', handler: doCancel }
    ];
    const alert = await this.alertCtrl.create({ header, message, buttons });
    alert.present();
  }
  async sendNewMessage(): Promise<void> {
    this.errors = new Set(this.newMessage.validate(this.topic));
    if (this.errors.size) return this.message.error('COMMON.FORM_HAS_ERROR_TO_CHECK');

    const doSend = async (): Promise<void> => {
      try {
        await this.loading.show();
        let message: Message;
        if (this.newMessage.creator) message = await this._messages.insert(this.topic, this.newMessage);
        else message = await this._messages.insertAnonymous(this.topic, this.newMessage);
        if (message.type === MessageTypes.QUESTION) this.filterQuestions(null, true);
        if (message.type === MessageTypes.APPRECIATION) this.filterAppreciations(null, true);
        this.newMessage = null;
        this.message.success('COMMON.OPERATION_COMPLETED');
      } catch (err) {
        this.message.error('COMMON.OPERATION_FAILED');
      } finally {
        this.loading.hide();
      }
    };

    const header = this.t._('MESSAGES.IS_YOUR_MESSAGE_READY');
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.SEND'), role: 'destructive', handler: doSend }
    ];
    const alert = await this.alertCtrl.create({ header, buttons });
    alert.present();
  }
  hasFieldAnError(field: string): boolean {
    return this.errors.has(field);
  }

  async upvoteMessage(message: Message): Promise<void> {
    // @todo
  }
  hasUserUpvotedMessage(message: Message): boolean {
    // @todo
    return false;
  }
  async seeMessageUpvoters(message: Message): Promise<void> {
    // @todo
  }
  private async changeCompleteStatus(message: Message, complete: boolean): Promise<void> {
    try {
      await this.loading.show();
      if (complete) message.load(await this._messages.markComplete(this.topic, message));
      else message.load(await this._messages.undoComplete(this.topic, message));
      if (message.type === MessageTypes.QUESTION) this.filterQuestions();
      if (message.type === MessageTypes.APPRECIATION) this.filterAppreciations();
      this.message.success('COMMON.OPERATION_COMPLETED');
    } catch (err) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }
  private async deleteMessage(message: Message): Promise<void> {
    const doDelete = async (): Promise<void> => {
      try {
        await this.loading.show();
        await this._messages.delete(this.topic, message);
        if (message.type === MessageTypes.QUESTION) this.filterQuestions(null, true);
        if (message.type === MessageTypes.APPRECIATION) this.filterAppreciations(null, true);
        this.message.success('COMMON.OPERATION_COMPLETED');
      } catch (err) {
        this.message.error('COMMON.OPERATION_FAILED');
      } finally {
        this.loading.hide();
      }
    };

    const header = this.t._('COMMON.ARE_YOU_SURE');
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.DELETE'), role: 'destructive', handler: doDelete }
    ];
    const alert = await this.alertCtrl.create({ header, buttons });
    alert.present();
  }
  private async deleteMessageAndBanUser(message: Message): Promise<void> {
    if (!message.creator) return;

    const doDelete = async (): Promise<void> => {
      try {
        await this.loading.show();
        await this._messages.delete(this.topic, message);
        if (message.type === MessageTypes.QUESTION) this.filterQuestions(null, true);
        if (message.type === MessageTypes.APPRECIATION) this.filterAppreciations(null, true);
        await this._configurations.banUserByID(message.creator.id);
        this.message.success('COMMON.OPERATION_COMPLETED');
      } catch (err) {
        this.message.error('COMMON.OPERATION_FAILED');
      } finally {
        this.loading.hide();
      }
    };

    const header = this.t._('MESSAGES.DELETE_AND_BAN_USER');
    const subHeader = this.t._('COMMON.ARE_YOU_SURE');
    const messageAlert = this.t._('MESSAGES.DELETE_AND_BAN_USER_I');
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.CONFIRM'), role: 'destructive', handler: doDelete }
    ];
    const alert = await this.alertCtrl.create({ header, subHeader, message: messageAlert, buttons });
    alert.present();
  }
  private async readMessageFullText(message: Message): Promise<void> {
    const buttons = [{ text: this.t._('COMMON.CLOSE') }];
    const alert = await this.alertCtrl.create({ message: message.text, buttons });
    alert.present();
  }
  async actionsOnMessage(message: Message): Promise<void> {
    if (!message) return;

    const header = this.t._('MESSAGES.ACTIONS');
    const buttons = [];

    if (!this.topic.isClosed()) {
      if (!message.completedAt) {
        buttons.push({
          text: this.t._('MESSAGES.MARK_COMPLETE'),
          icon: 'checkmark-done',
          handler: (): Promise<void> => this.changeCompleteStatus(message, true)
        });
      } else if (this.app.user.isAdministrator) {
        buttons.push({
          text: this.t._('MESSAGES.UNDO_COMPLETE'),
          icon: 'square-outline',
          handler: (): Promise<void> => this.changeCompleteStatus(message, false)
        });
      }
    }

    if (this.app.user.isAdministrator) {
      if (message.type === MessageTypes.QUESTION && message.text) {
        buttons.push({
          text: this.t._('MESSAGES.READ_FULL_TEXT'),
          icon: 'document-text',
          handler: (): Promise<void> => this.readMessageFullText(message)
        });
      }
      buttons.push({
        text: this.t._('MESSAGES.SEE_UPVOTERS'),
        icon: 'eye',
        handler: (): Promise<void> => this.seeMessageUpvoters(message)
      });
    }

    buttons.push({
      text: this.t._('MESSAGES.DELETE'),
      icon: 'trash',
      role: 'destructive',
      handler: (): Promise<void> => this.deleteMessage(message)
    });
    if (this.app.user.isAdministrator && message.creator) {
      buttons.push({
        text: this.t._('MESSAGES.DELETE_AND_BAN_USER'),
        icon: 'ban',
        role: 'destructive',
        handler: (): Promise<void> => this.deleteMessageAndBanUser(message)
      });
    }

    buttons.push({ text: this.t._('COMMON.CANCEL'), role: 'cancel', icon: 'arrow-undo' });

    const actions = await this.actionsCtrl.create({ header, buttons });
    actions.present();
  }

  openTopic(topic: Topic): void {
    this.app.goToInTabs(['topics', topic.topicId, topic.type === TopicTypes.LIVE ? 'live' : 'standard']);
  }

  async enterFullScreen(): Promise<void> {
    this.fullScreen = true;
    setTimeout((): void => {
      this.generateQRCodeCanvasByURL(env.idea.app.url.concat(`t/topics/${this.topic.topicId}/live`));
    });
  }
  exitFullScreen(): void {
    this.hideQuestions = false;
    this.hideAppreciations = false;
    this.fullScreen = false;
  }

  private generateQRCodeCanvasByURL(url: string): Promise<void> {
    return new Promise((resolve, reject): void => {
      const container = document.getElementById('qrCodeContainer');
      container.innerHTML = '';
      toCanvas(url, { errorCorrectionLevel: 'L' }, (err: Error, canvas: HTMLCanvasElement): void => {
        if (err) return reject(err);
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.borderRadius = '4px';
        container.appendChild(canvas);
        resolve();
      });
    });
  }
}
