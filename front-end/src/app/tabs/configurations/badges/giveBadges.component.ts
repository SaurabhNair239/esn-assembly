import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsService } from '@idea-ionic/common';

import { AppService } from '@app/app.service';
import { BadgesService } from '../../profile/badges/badges.service';

import { Badge, UserBadge } from '@models/badge.model';

@Component({
  selector: 'app-give-badges',
  templateUrl: 'giveBadges.component.html',
  styleUrls: ['giveBadges.component.scss']
})
export class GiveBadgesComponent implements OnInit {
  userId: string;
  badges: Badge[];
  usersBadges: UserBadge[];

  constructor(
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private t: IDEATranslationsService,
    public _badges: BadgesService,
    public app: AppService
  ) {}
  async ngOnInit(): Promise<void> {
    this.badges = await this._badges.getList({ force: true });
  }

  async getUserBadges(userId: string): Promise<void> {
    if (!userId) return;
    userId = userId.toLowerCase();
    this.usersBadges = null;
    try {
      await this.loading.show();
      this.usersBadges = await this._badges.getListOfUserById(userId);
    } catch (error) {
      this.message.error('COMMON.SOMETHING_WENT_WRONG');
    } finally {
      this.loading.hide();
    }
  }

  async removeBadgeFromUser(userId: string, userBadge: UserBadge): Promise<void> {
    userId = userId.toLowerCase();
    const doRemove = async (): Promise<void> => {
      try {
        await this.loading.show();
        await this._badges.removeBadgeFromUser(userId, userBadge.badge);
        this.usersBadges.splice(this.usersBadges.indexOf(userBadge), 1);
        this.message.success('COMMON.OPERATION_COMPLETED');
      } catch (error) {
        this.message.error('COMMON.OPERATION_FAILED');
      } finally {
        this.loading.hide();
      }
    };

    const header = this.t._('COMMON.ARE_YOU_SURE');
    const buttons = [{ text: this.t._('COMMON.CANCEL') }, { text: this.t._('COMMON.CONFIRM'), handler: doRemove }];
    const alert = await this.alertCtrl.create({ header, buttons });
    await alert.present();
  }

  async addBadgeToUser(userId: string): Promise<void> {
    userId = userId.toLowerCase();
    const header = this.t._('CONFIGURATIONS.GIVE_A_BADGE');
    const subHeader = userId;
    const inputs: any[] = this.badges.map(badge => ({ type: 'radio', value: badge.badgeId, label: badge.name }));

    const doAdd = async (badge: string): Promise<void> => {
      try {
        await this.loading.show();
        await this._badges.addBadgeToUser(userId, badge);
        this.usersBadges.unshift(new UserBadge({ userId, badge }));
        this.message.success('COMMON.OPERATION_COMPLETED');
      } catch (error) {
        this.message.error('COMMON.OPERATION_FAILED');
      } finally {
        this.loading.hide();
      }
    };
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.CONFIRM'), handler: doAdd }
    ];

    const alert = await this.alertCtrl.create({ header, subHeader, inputs, buttons });
    alert.present();
  }

  close(): void {
    this.modalCtrl.dismiss();
  }
}
