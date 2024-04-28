import { Component, OnInit, ViewChild } from '@angular/core';
import { IonInfiniteScroll, IonRefresher, IonSearchbar } from '@ionic/angular';
import { IDEAActionSheetController, IDEATranslationsService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { VotingService, VotingSessionsSortBy } from './voting.service';
import { GAEventsService } from '../configurations/events/events.service';

import { GAEvent } from '@models/event.model';
import { VotingSession, VotingSessionTypes } from '@models/votingSession.model';

@Component({
  selector: 'voting-sessions',
  templateUrl: 'votingSessions.page.html',
  styleUrls: ['votingSessions.page.scss']
})
export class VotingSessionsPage implements OnInit {
  votingSessions: VotingSession[];

  @ViewChild('searchbar') searchbar: IonSearchbar;

  events: GAEvent[];
  filterByEvent: string = null;

  sortBy: VotingSessionsSortBy = VotingSessionsSortBy.CREATED_DATE_DESC;
  SortBy = VotingSessionsSortBy;

  constructor(
    private actionsCtrl: IDEAActionSheetController,
    private t: IDEATranslationsService,
    private _voting: VotingService,
    private _events: GAEventsService,
    public app: AppService
  ) {}
  async ngOnInit(): Promise<void> {
    await this.loadResources();
  }
  ionViewDidEnter(): void {
    this.filter(null, null, true);
  }
  private async loadResources(): Promise<void> {
    [this.votingSessions, this.events] = await Promise.all([
      this._voting.getActiveList({ force: true, withPagination: true }),
      this._events.getList()
    ]);
  }
  async handleRefresh(refresh: IonRefresher): Promise<void> {
    this.votingSessions = null;
    await this.loadResources();
    refresh.complete();
  }

  async filter(search = '', scrollToNextPage?: IonInfiniteScroll, force = false): Promise<void> {
    let startPaginationAfterId = null;
    if (scrollToNextPage && this.votingSessions?.length)
      startPaginationAfterId = this.votingSessions[this.votingSessions.length - 1].sessionId;

    this.votingSessions = await this._voting.getActiveList({
      force,
      search,
      eventId: this.filterByEvent,
      withPagination: true,
      startPaginationAfterId,
      sortBy: this.sortBy
    });

    if (scrollToNextPage) setTimeout((): Promise<void> => scrollToNextPage.complete(), 100);
  }

  goToVotingSession(votingSession: VotingSession): void {
    this.app.goToInTabs(['voting', votingSession.sessionId]);
  }
  async addVotingSession(): Promise<void> {
    const header = this.t._('VOTING.CHOOSE_TYPE');
    const buttons = [
      {
        text: this.t._('VOTING.TYPES.FORM_PUBLIC'),
        icon: 'document-text',
        handler: (): void => this.app.goToInTabs(['voting', VotingSessionTypes.FORM_PUBLIC, 'manage'])
      },
      {
        text: this.t._('VOTING.TYPES.FORM_SECRET'),
        icon: 'document-lock',
        handler: (): void => this.app.goToInTabs(['voting', VotingSessionTypes.FORM_SECRET, 'manage'])
      },
      {
        text: this.t._('VOTING.TYPES.IMMEDIATE'),
        icon: 'chatbox',
        handler: (): void => this.app.goToInTabs(['voting', VotingSessionTypes.IMMEDIATE, 'manage'])
      },
      {
        text: this.t._('VOTING.TYPES.ROLL_CALL'),
        icon: 'hand-right',
        handler: (): void => this.app.goToInTabs(['voting', VotingSessionTypes.ROLL_CALL, 'manage'])
      },
      { text: this.t._('COMMON.CANCEL'), role: 'cancel', icon: 'arrow-undo' }
    ];

    const actions = await this.actionsCtrl.create({ header, buttons });
    actions.present();
  }
}
