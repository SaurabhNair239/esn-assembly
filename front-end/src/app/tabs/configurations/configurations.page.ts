import { Component, OnInit } from '@angular/core';
import { AlertController, ModalController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsService } from '@idea-ionic/common';

import { EmailTemplateComponent } from './emailTemplate/emailTemplate.component';
import { GiveBadgesComponent } from './badges/giveBadges.component';

import { AppService } from '@app/app.service';
import { ConfigurationsService, EmailTemplates } from './configurations.service';

import { Configurations } from '@models/configurations.model';
import { cleanESNAccountsIdForURL } from '@models/utils';

@Component({
  selector: 'configurations',
  templateUrl: 'configurations.page.html',
  styleUrls: ['configurations.page.scss']
})
export class ConfigurationsPage implements OnInit {
  configurations: Configurations;

  EmailTemplates = EmailTemplates;

  constructor(
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private t: IDEATranslationsService,
    private _configurations: ConfigurationsService,
    public app: AppService
  ) {}
  async ngOnInit(): Promise<void> {
    this.configurations = await this._configurations.get();
  }

  addAdministrator(): void {
    this.addUserToList('administratorsIds', 'ADD_ADMINISTRATOR');
  }
  addOpportunitiesManager(): void {
    this.addUserToList('opportunitiesManagersIds', 'ADD_OPPORTUNITIES_MANAGER');
  }
  addBannedUser(): void {
    this.addUserToList('bannedUsersIds', 'ADD_BANNED_USER');
  }
  private async addUserToList(listKey: string, translationKey: string): Promise<void> {
    const doAdd = async ({ userId }): Promise<void> => {
      if (!userId) return;
      const newConfigurations = new Configurations(this.configurations);
      newConfigurations[listKey].push(userId);
      await this.updateConfigurations(newConfigurations);
    };

    const header = this.t._('CONFIGURATIONS.'.concat(translationKey));
    const message = this.t._('CONFIGURATIONS.ADD_USERS_BY_THEIR_USERNAME');
    const inputs: any = [{ name: 'userId', type: 'text' }];
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.ADD'), handler: doAdd }
    ];

    const alert = await this.alertCtrl.create({ header, message, inputs, buttons });
    await alert.present();
  }

  removeAdministratorById(userId: string): void {
    this.removeUserFromListById(userId, 'administratorsIds');
  }
  removeOpportunitiesManagerById(userId: string): void {
    this.removeUserFromListById(userId, 'opportunitiesManagersIds');
  }
  removeBannedUserById(userId: string): void {
    this.removeUserFromListById(userId, 'bannedUsersIds');
  }
  private async removeUserFromListById(userId: string, listKey: string): Promise<void> {
    const doRemove = async (): Promise<void> => {
      const newConfigurations = new Configurations(this.configurations);
      newConfigurations[listKey].splice(newConfigurations[listKey].indexOf(userId), 1);
      await this.updateConfigurations(newConfigurations);
    };

    const header = this.t._('COMMON.ARE_YOU_SURE');
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.REMOVE'), handler: doRemove }
    ];
    const alert = await this.alertCtrl.create({ header, buttons });
    alert.present();
  }

  private async updateConfigurations(newConfigurations: Configurations): Promise<void> {
    try {
      await this.loading.show();
      this.configurations = await this._configurations.update(newConfigurations);
      this.message.success('COMMON.OPERATION_COMPLETED');
    } catch (error) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }

  async openUserProfileById(userId: string): Promise<void> {
    const url = 'https://accounts.esn.org/user/'.concat(cleanESNAccountsIdForURL(userId));
    await this.app.openURL(url);
  }

  async openTemplateEmailModal(template: EmailTemplates): Promise<void> {
    const componentProps = { template };
    const modal = await this.modalCtrl.create({ component: EmailTemplateComponent, componentProps });
    await modal.present();
  }

  async openBadgesModal(): Promise<void> {
    const modal = await this.modalCtrl.create({ component: GiveBadgesComponent });
    await modal.present();
  }
}
