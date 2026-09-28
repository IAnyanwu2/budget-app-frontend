import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

interface PlaidLinkHandler {
  open(): void;
}

interface PlaidLinkSdk {
  create(configuration: {
    token: string;
    onSuccess: (publicToken: string) => void;
    onExit: (error: { error_message?: string } | null) => void;
  }): PlaidLinkHandler;
}

interface PlaidWindow extends Window {
  Plaid?: PlaidLinkSdk;
}

export interface PlaidConnectionResult {
  cancelled: boolean;
  importedTransactions: number;
}

@Injectable({ providedIn: 'root' })
export class PlaidLinkService {
  constructor(
    private http: HttpClient,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  async connectAndSync(): Promise<PlaidConnectionResult> {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('Bank linking is only available in a browser.');
    }

    const tokenResponse = await firstValueFrom(
      this.http.post<{ linkToken: string }>(`${environment.apiBaseUrl}/plaid/link-token`, {})
    );
    const plaid = await this.loadSdk();

    return new Promise<PlaidConnectionResult>((resolve, reject) => {
      let connectionCompleted = false;
      const handler = plaid.create({
        token: tokenResponse.linkToken,
        onSuccess: async (publicToken) => {
          try {
            await firstValueFrom(this.http.post(`${environment.apiBaseUrl}/plaid/exchange`, { publicToken }));
            const importedTransactions = await this.syncTransactions();
            connectionCompleted = true;
            resolve({ cancelled: false, importedTransactions });
          } catch (error) {
            reject(error);
          }
        },
        onExit: (error) => {
          if (!connectionCompleted) {
            if (error?.error_message) {
              reject(new Error(error.error_message));
            } else {
              resolve({ cancelled: true, importedTransactions: 0 });
            }
          }
        }
      });

      handler.open();
    });
  }

  async syncTransactions(): Promise<number> {
    const syncResults = await firstValueFrom(
      this.http.post<Array<{ added: number }>>(`${environment.apiBaseUrl}/plaid/sync`, {})
    );
    return syncResults.reduce((total, item) => total + item.added, 0);
  }

  private async loadSdk(): Promise<PlaidLinkSdk> {
    const browserWindow = this.document.defaultView as PlaidWindow | null;
    if (!browserWindow) {
      throw new Error('Plaid Link is unavailable in this browser.');
    }
    if (browserWindow.Plaid) return browserWindow.Plaid;

    await new Promise<void>((resolve, reject) => {
      let script = this.document.getElementById('plaid-link-sdk') as HTMLScriptElement | null;
      if (!script) {
        script = this.document.createElement('script');
        script.id = 'plaid-link-sdk';
        script.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js';
        script.async = true;
        this.document.head.appendChild(script);
      }

      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => reject(new Error('Could not load Plaid Link.')), { once: true });
    });

    if (!browserWindow.Plaid) {
      throw new Error('Plaid Link loaded without exposing its SDK.');
    }
    return browserWindow.Plaid;
  }
}