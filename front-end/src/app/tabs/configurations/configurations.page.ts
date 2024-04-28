import { Component, OnInit, ViewChild } from '@angular/core';
import { AlertController, IonInfiniteScroll, IonSearchbar, ModalController } from '@ionic/angular';
import { IDEALoadingService, IDEAMessageService, IDEATranslationsService } from '@idea-ionic/common';

import { EmailTemplateComponent } from './emailTemplate/emailTemplate.component';
import { GiveBadgesComponent } from './badges/giveBadges.component';
import { ManageBadgesComponent } from './badges/manageBadges.component';

import { AppService } from '@app/app.service';
import { ConfigurationsService } from './configurations.service';
import { BadgesService } from './badges/badges.service';
import { MediaService } from '@app/common/media.service';

import { Configurations, EmailTemplates, UsersOriginDisplayOptions } from '@models/configurations.model';
import { Badge } from '@models/badge.model';

@Component({
  selector: 'configurations',
  templateUrl: 'configurations.page.html',
  styleUrls: ['configurations.page.scss']
})
export class ConfigurationsPage implements OnInit {
  configurations: Configurations;

  pageSection = PageSections.CONTENTS;
  PageSections = PageSections;

  EmailTemplates = EmailTemplates;
  UODP = UsersOriginDisplayOptions;

  timezones = (Intl as any).supportedValuesOf('timeZone');

  badges: Badge[];

  @ViewChild('badgesSearchbar') badgesSearchbar: IonSearchbar;

  constructor(
    private modalCtrl: ModalController,
    private alertCtrl: AlertController,
    private loading: IDEALoadingService,
    private message: IDEAMessageService,
    private t: IDEATranslationsService,
    private _configurations: ConfigurationsService,
    private _media: MediaService,
    public _badges: BadgesService,
    public app: AppService
  ) {}
  async ngOnInit(): Promise<void> {
    this.configurations = await this._configurations.get();
    this.filterBadges(null, null, true);
  }

  addAdministrator(): void {
    this.addUserToList('administratorsIds', 'ADD_ADMINISTRATOR');
  }
  addOpportunitiesManager(): void {
    this.addUserToList('opportunitiesManagersIds', 'ADD_OPPORTUNITIES_MANAGER');
  }
  addDashboardManager(): void {
    this.addUserToList('dashboardManagersIds', 'ADD_DASHBOARD_MANAGER');
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
  removeDashboardManagerById(userId: string): void {
    this.removeUserFromListById(userId, 'dashboardManagersIds');
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
      { text: this.t._('COMMON.REMOVE'), role: 'destructive', handler: doRemove }
    ];
    const alert = await this.alertCtrl.create({ header, buttons });
    alert.present();
  }

  async updateConfigurations(newConfigurations: Configurations = this.configurations): Promise<void> {
    try {
      await this.loading.show();
      this.configurations = await this._configurations.update(newConfigurations);
      this.app.configurations.load(this.configurations);
      this.message.success('COMMON.OPERATION_COMPLETED');
    } catch (error) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      this.loading.hide();
    }
  }

  async openTemplateEmailModal(template: EmailTemplates): Promise<void> {
    const componentProps = { template };
    const modal = await this.modalCtrl.create({ component: EmailTemplateComponent, componentProps });
    await modal.present();
  }

  async changeAppTitle(): Promise<void> {
    const header = this.t._('CONFIGURATIONS.APP_TITLE');
    const inputs: any[] = [{ name: 'appTitle', type: 'text', value: this.configurations.appTitle }];
    const doChange = async ({ appTitle }): Promise<void> => {
      if (!appTitle) return;
      const newConfigurations = new Configurations(this.configurations);
      newConfigurations.appTitle = appTitle;
      await this.updateConfigurations(newConfigurations);
    };
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.CONFIRM'), handler: doChange }
    ];
    const alert = await this.alertCtrl.create({ header, inputs, buttons });
    await alert.present();
  }
  async changeAppSubtitle(): Promise<void> {
    const header = this.t._('CONFIGURATIONS.APP_SUBTITLE');
    const inputs: any[] = [{ name: 'appSubtitle', type: 'text', value: this.configurations.appSubtitle }];
    const doChange = async ({ appSubtitle }): Promise<void> => {
      if (!appSubtitle) return;
      const newConfigurations = new Configurations(this.configurations);
      newConfigurations.appSubtitle = appSubtitle;
      await this.updateConfigurations(newConfigurations);
    };
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.CONFIRM'), handler: doChange }
    ];
    const alert = await this.alertCtrl.create({ header, inputs, buttons });
    await alert.present();
  }
  async changeSupportEmail(): Promise<void> {
    const header = this.t._('CONFIGURATIONS.SUPPORT_EMAIL');
    const inputs: any[] = [{ name: 'supportEmail', type: 'text', value: this.configurations.supportEmail }];
    const doChange = async ({ supportEmail }): Promise<void> => {
      if (!supportEmail) return;
      const newConfigurations = new Configurations(this.configurations);
      newConfigurations.supportEmail = supportEmail;
      await this.updateConfigurations(newConfigurations);
    };
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.CONFIRM'), handler: doChange }
    ];
    const alert = await this.alertCtrl.create({ header, inputs, buttons });
    await alert.present();
  }
  async uploadAppLogo({ target }, darkMode = false): Promise<void> {
    const file = target.files[0];
    if (!file) return;

    try {
      await this.loading.show();
      const imageURI = await this._media.uploadImage(file);
      const newConfigurations = new Configurations(this.configurations);
      if (darkMode) newConfigurations.appLogoURLDarkMode = this.app.getImageURLByURI(imageURI);
      else newConfigurations.appLogoURL = this.app.getImageURLByURI(imageURI);
      this.updateConfigurations(newConfigurations);
    } catch (error) {
      this.message.error('COMMON.OPERATION_FAILED');
    } finally {
      if (target) target.value = '';
      this.loading.hide();
    }
  }
  async resetAppLogo(darkMode = false): Promise<void> {
    const doReset = async (): Promise<void> => {
      const newConfigurations = new Configurations(this.configurations);
      if (darkMode) newConfigurations.appLogoURLDarkMode = null;
      else newConfigurations.appLogoURL = null;
      await this.updateConfigurations(newConfigurations);
    };
    const header = this.t._('CONFIGURATIONS.RESET_APP_LOGO');
    const message = this.t._('CONFIGURATIONS.RESET_APP_LOGO_I');
    const buttons = [
      { text: this.t._('COMMON.CANCEL'), role: 'cancel' },
      { text: this.t._('COMMON.RESET'), role: 'destructive', handler: doReset }
    ];
    const alert = await this.alertCtrl.create({ header, message, buttons });
    alert.present();
  }
  async setVisibilityQATopicsFeature(show: boolean): Promise<void> {
    const newConfigurations = new Configurations(this.configurations);
    newConfigurations.hideQATopics = !show;
    await this.updateConfigurations(newConfigurations);
  }
  async setVisibilityOpportunitiesFeature(show: boolean): Promise<void> {
    const newConfigurations = new Configurations(this.configurations);
    newConfigurations.hideOpportunities = !show;
    await this.updateConfigurations(newConfigurations);
  }
  async setVisibilityVotingFeature(show: boolean): Promise<void> {
    const newConfigurations = new Configurations(this.configurations);
    newConfigurations.hideVoting = !show;
    await this.updateConfigurations(newConfigurations);
  }
  async setVisibilityBadgesFeature(show: boolean): Promise<void> {
    const newConfigurations = new Configurations(this.configurations);
    newConfigurations.hideBadges = !show;
    await this.updateConfigurations(newConfigurations);
  }

  async filterBadges(search = '', scrollToNextPage?: IonInfiniteScroll, force = false): Promise<void> {
    let startPaginationAfterId = null;
    if (scrollToNextPage && this.badges?.length) startPaginationAfterId = this.badges[this.badges.length - 1].badgeId;

    this.badges = await this._badges.getList({ force, search, withPagination: true, startPaginationAfterId });

    if (scrollToNextPage) setTimeout((): Promise<void> => scrollToNextPage.complete(), 100);
  }
  async openBadgesModal(): Promise<void> {
    const modal = await this.modalCtrl.create({ component: GiveBadgesComponent });
    await modal.present();
  }
  async addCustomBadge(): Promise<void> {
    await this.manageCustomBadge(new Badge());
  }
  async manageCustomBadge(badge: Badge): Promise<void> {
    const componentProps = { badge };
    const modal = await this.modalCtrl.create({ component: ManageBadgesComponent, componentProps });
    modal.onDidDismiss().then(({ data }): void => {
      if (!data) return;
      this.badges = null;
      this.filterBadges(this.badgesSearchbar?.value, null, true);
    });
    modal.present();
  }
}

enum PageSections {
  CONTENTS = 'CONTENTS',
  USERS = 'USERS',
  USERS_BADGES = 'USERS_BADGES',
  TEMPLATES = 'TEMPLATES',
  OPTIONS = 'OPTIONS'
}
