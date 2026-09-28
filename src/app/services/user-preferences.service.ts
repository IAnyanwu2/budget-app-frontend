import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface UserPreferences {
  notifications: boolean;
  currency: string;
  theme: 'dark' | 'light';
}

const DEFAULT_PREFERENCES: UserPreferences = {
  notifications: true,
  currency: 'USD',
  theme: 'dark'
};

@Injectable({ providedIn: 'root' })
export class UserPreferencesService {
  private readonly storageKey = 'user_settings';
  private readonly preferencesSubject = new BehaviorSubject<UserPreferences>(DEFAULT_PREFERENCES);
  readonly preferences$ = this.preferencesSubject.asObservable();

  constructor(
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const stored = localStorage.getItem(this.storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<UserPreferences>;
          this.preferencesSubject.next({
            notifications: typeof parsed.notifications === 'boolean' ? parsed.notifications : DEFAULT_PREFERENCES.notifications,
            currency: ['USD', 'EUR', 'GBP'].includes(parsed.currency ?? '') ? parsed.currency! : DEFAULT_PREFERENCES.currency,
            theme: parsed.theme === 'light' ? 'light' : 'dark'
          });
        }
      } catch {
        localStorage.removeItem(this.storageKey);
      }
      this.applyTheme(this.preferencesSubject.value.theme);
    }
  }

  get current(): UserPreferences {
    return this.preferencesSubject.value;
  }

  save(preferences: UserPreferences): void {
    const normalized: UserPreferences = {
      notifications: !!preferences.notifications,
      currency: ['USD', 'EUR', 'GBP'].includes(preferences.currency) ? preferences.currency : DEFAULT_PREFERENCES.currency,
      theme: preferences.theme === 'light' ? 'light' : 'dark'
    };
    this.preferencesSubject.next(normalized);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.storageKey, JSON.stringify(normalized));
      this.applyTheme(normalized.theme);
    }
  }

  private applyTheme(theme: UserPreferences['theme']): void {
    this.document.documentElement.setAttribute('data-theme', theme);
  }
}