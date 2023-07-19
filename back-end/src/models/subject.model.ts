import { Resource } from 'idea-toolbox';

import { User } from './user.model';
import { cleanESNAccountsIdForURL } from './utils';

/**
 * A user subject to a topic, a questio, an answer, etc..
 */
export class Subject extends Resource {
  /**
   * The ESN Accounts ID of the subject (lowercase).
   */
  id: string;
  /**
   * The type of subject.
   */
  type: SubjectTypes;
  /**
   * The name of the subject.
   */
  name: string;
  /**
   * The URL to the subject's avatar.
   */
  avatarURL?: string;
  /**
   * The name of the subject's ESN Section.
   */
  section?: string;
  /**
   * The name of the subject's ESN country.
   */
  country?: string;
  /**
   * The email for notifications.
   */
  email: string;

  /**
   * Create a new subject starting from a user.
   */
  static fromUser(user: User): Subject {
    return new Subject({
      id: user.userId,
      type: SubjectTypes.USER,
      name: user.firstName.concat(' ', user.lastName),
      avatarURL: user.avatarURL,
      section: user.section,
      country: user.country,
      email: user.email
    });
  }

  load(x: any): void {
    super.load(x);
    this.id = this.clean(x.id, String)?.toLowerCase();
    this.type = this.clean(x.type, String);
    this.name = this.clean(x.name, String);
    if (this.type === SubjectTypes.USER) {
      this.avatarURL = this.clean(x.avatarURL, String);
      this.section = this.clean(x.section, String);
    } else {
      delete this.avatarURL;
      delete this.section;
    }
    if (this.type !== SubjectTypes.COUNTRY) {
      this.country = this.clean(x.country, String);
    } else {
      delete this.country;
    }
    this.email = this.clean(x.email, String);
  }

  validate(): string[] {
    const e = super.validate();
    if (this.iE(this.id)) e.push('id');
    if (this.iE(this.type)) e.push('type');
    if (this.iE(this.name)) e.push('name');
    if (this.type === SubjectTypes.USER) {
      if (this.iE(this.section)) e.push('section');
    }
    if (this.type !== SubjectTypes.COUNTRY) {
      if (this.iE(this.country)) e.push('country');
    }
    return e;
  }

  /**
   * Get the subject's URL in ESN Accounts.
   */
  getURL(): string {
    const BASE_URL = 'https://accounts.esn.org/';
    const cleanedId = cleanESNAccountsIdForURL(this.id);
    switch (this.type) {
      case SubjectTypes.USER:
        return BASE_URL.concat('user/', cleanedId);
      case SubjectTypes.COUNTRY:
        return BASE_URL.concat('country/', cleanedId);
      case SubjectTypes.SECTION:
        return BASE_URL.concat('section/', cleanedId);
    }
  }

  /**
   * Get a string representing the ESN Section and Country of the subject.
   * @todo to solve a known error from ESN Accounts: the Country isn't returned correctly.
   */
  getSectionCountry(): string {
    if (this.country === this.section) return this.section;
    return [this.country, this.section].filter(x => x).join(' - ');
  }
}

/**
 * The possible type of subjects.
 */
export enum SubjectTypes {
  USER = 'USER',
  SECTION = 'SECTION',
  COUNTRY = 'COUNTRY'
}
