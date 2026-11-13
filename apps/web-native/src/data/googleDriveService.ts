import { extractBackupHeaderDate, parseBackupHeaderDate } from '../domain/backupCsv';
import {
  DEFAULT_GOOGLE_CLIENT_ID,
  DRIVE_BACKUP_FOLDER_NAME,
  DRIVE_BACKUP_FILE_NAME,
  DRIVE_SCOPE,
} from './driveConfig';

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            prompt?: string;
            hint?: string;
            callback: (response: GoogleTokenResponse) => void;
            error_callback?: (err: unknown) => void;
          }): GoogleTokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  expires_in?: number;
}

interface GoogleTokenClient {
  requestAccessToken(overrideConfig?: { prompt?: string; login_hint?: string; hint?: string }): void;
}

export interface DriveBackupFileInfo {
  id: string;
  name: string;
  createdTime?: string;
  modifiedTime?: string;
  headerDate: string | null;
  headerTimestamp: number | null;
}

const TOKEN_STORAGE_KEY = 'gb_drive_access_token';
const EXPIRY_STORAGE_KEY = 'gb_drive_token_expiry';
const EMAIL_STORAGE_KEY = 'gb_drive_user_email';
const LAST_EMAIL_STORAGE_KEY = 'gb_drive_last_email';

export class GoogleDriveService {
  private tokenClient: GoogleTokenClient | null = null;
  private currentClientId: string = '';
  private cachedFolderId: string | null = null;

  private loadGisScript(): Promise<void> {
    if (window.google?.accounts?.oauth2) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', (e) => reject(new Error('Errore caricamento Google Identity Services')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Impossibile caricare lo script Google Identity Services'));
      document.head.appendChild(script);
    });
  }

  async init(customClientId?: string): Promise<boolean> {
    const clientId = (customClientId || DEFAULT_GOOGLE_CLIENT_ID).trim();
    if (!clientId) {
      return false;
    }
    this.currentClientId = clientId;
    await this.loadGisScript();
    return true;
  }

  getEffectiveClientId(customClientId?: string): string {
    return (customClientId || this.currentClientId || DEFAULT_GOOGLE_CLIENT_ID).trim();
  }

  getAccessToken(): string | null {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    const expiryStr = sessionStorage.getItem(EXPIRY_STORAGE_KEY);
    if (!token || !expiryStr) {
      return null;
    }
    const expiry = Number(expiryStr);
    if (!Number.isFinite(expiry) || Date.now() >= expiry - 60000) {
      this.clearSession();
      return null;
    }
    return token;
  }

  getUserEmail(): string | null {
    return sessionStorage.getItem(EMAIL_STORAGE_KEY) || localStorage.getItem(LAST_EMAIL_STORAGE_KEY);
  }

  getLastUserEmail(): string | null {
    return localStorage.getItem(LAST_EMAIL_STORAGE_KEY) || sessionStorage.getItem(EMAIL_STORAGE_KEY);
  }

  isSignedIn(): boolean {
    return Boolean(this.getAccessToken());
  }

  clearSession(forgetAccount: boolean = false): void {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(EXPIRY_STORAGE_KEY);
    sessionStorage.removeItem(EMAIL_STORAGE_KEY);
    if (forgetAccount) {
      localStorage.removeItem(LAST_EMAIL_STORAGE_KEY);
    }
    this.cachedFolderId = null;
    if (forgetAccount && token && window.google?.accounts?.oauth2?.revoke) {
      try {
        window.google.accounts.oauth2.revoke(token);
      } catch {
        // Ignora errori di revoke
      }
    }
  }

  async signIn(
    customClientId?: string,
    options?: { selectAccount?: boolean },
  ): Promise<{ email: string | null; accessToken: string }> {
    const clientId = this.getEffectiveClientId(customClientId);
    if (!clientId) {
      throw new Error('Google Client ID non configurato. Inserisci il Client ID nella scheda Varie.');
    }
    await this.loadGisScript();

    const savedEmail = !options?.selectAccount
      ? localStorage.getItem(LAST_EMAIL_STORAGE_KEY) || sessionStorage.getItem(EMAIL_STORAGE_KEY)
      : null;

    return new Promise((resolve, reject) => {
      try {
        const promptValue = options?.selectAccount ? 'select_account' : '';
        this.tokenClient = window.google!.accounts!.oauth2!.initTokenClient({
          client_id: clientId,
          scope: DRIVE_SCOPE,
          prompt: promptValue,
          callback: async (resp: GoogleTokenResponse) => {
            if (resp.error || !resp.access_token) {
              reject(new Error(resp.error || 'Autenticazione con Google fallita o annullata.'));
              return;
            }
            const expiresIn = resp.expires_in ?? 3600;
            const expiry = Date.now() + expiresIn * 1000;
            sessionStorage.setItem(TOKEN_STORAGE_KEY, resp.access_token);
            sessionStorage.setItem(EXPIRY_STORAGE_KEY, String(expiry));

            let userEmail: string | null = null;
            try {
              const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${resp.access_token}` },
              });
              if (infoRes.ok) {
                const info = (await infoRes.json()) as { email?: string };
                userEmail = info.email ?? null;
                if (userEmail) {
                  sessionStorage.setItem(EMAIL_STORAGE_KEY, userEmail);
                  localStorage.setItem(LAST_EMAIL_STORAGE_KEY, userEmail);
                }
              }
            } catch {
              // Se la richiesta userinfo non va, il token Drive rimane comunque valido
            }

            resolve({ email: userEmail, accessToken: resp.access_token });
          },
          error_callback: (err: unknown) => {
            reject(new Error(`Errore autorizzazione Google: ${String(err)}`));
          },
        });

        const reqConfig: { prompt?: string; login_hint?: string } = {
          prompt: promptValue,
        };
        if (savedEmail) {
          reqConfig.login_hint = savedEmail;
        }

        this.tokenClient.requestAccessToken(reqConfig);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Impossibile avviare il login Google'));
      }
    });
  }

  private async fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
    const token = this.getAccessToken();
    if (!token) {
      throw new Error('Non sei collegato a Google Drive. Effettua prima l’accesso.');
    }
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(url, { ...init, headers });
    if (res.status === 401) {
      this.clearSession();
      throw new Error('Sessione Google scaduta o non valida. Effettua nuovamente l’accesso a Drive.');
    }
    return res;
  }

  async getOrCreateAppFolder(): Promise<string> {
    if (this.cachedFolderId) {
      return this.cachedFolderId;
    }
    const query = encodeURIComponent(
      `name = '${DRIVE_BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    );
    const searchRes = await this.fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name)`,
    );
    if (!searchRes.ok) {
      const errText = await searchRes.text();
      throw new Error(`Errore ricerca cartella Drive: ${errText}`);
    }
    const searchJson = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
    if (searchJson.files && searchJson.files.length > 0) {
      this.cachedFolderId = searchJson.files[0].id;
      return this.cachedFolderId;
    }

    const createRes = await this.fetchWithAuth('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: DRIVE_BACKUP_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Errore creazione cartella Drive: ${errText}`);
    }
    const createJson = (await createRes.json()) as { id: string };
    this.cachedFolderId = createJson.id;
    return this.cachedFolderId;
  }

  async listBackupFiles(): Promise<Array<{ id: string; name: string; createdTime?: string; modifiedTime?: string }>> {
    const folderId = await this.getOrCreateAppFolder();
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await this.fetchWithAuth(
      `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc,createdTime desc,name desc&fields=files(id,name,createdTime,modifiedTime,size)&pageSize=50`,
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Errore lettura file da Drive: ${errText}`);
    }
    const json = (await res.json()) as { files?: Array<{ id: string; name: string; createdTime?: string; modifiedTime?: string }> };
    return json.files ?? [];
  }

  async downloadFileContent(fileId: string): Promise<string> {
    const res = await this.fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Errore download file da Drive: ${errText}`);
    }
    return res.text();
  }

  async getLatestBackupFile(): Promise<(DriveBackupFileInfo & { content: string }) | null> {
    const files = await this.listBackupFiles();
    if (files.length === 0) {
      return null;
    }

    // Il primo file è il più recente per createdTime desc
    const latest = files[0];
    const content = await this.downloadFileContent(latest.id);
    const headerDate = extractBackupHeaderDate(content);
    const headerTimestamp = parseBackupHeaderDate(headerDate);

    return {
      id: latest.id,
      name: latest.name,
      createdTime: latest.createdTime,
      modifiedTime: latest.modifiedTime,
      headerDate,
      headerTimestamp,
      content,
    };
  }

  async uploadBackupFile(
    csvContent: string,
    targetFilename = DRIVE_BACKUP_FILE_NAME,
  ): Promise<{ id: string; name: string }> {
    const folderId = await this.getOrCreateAppFolder();
    const existingFiles = await this.listBackupFiles();

    // Se esiste già un file (o file vecchi creati in precedenza con timestamp),
    // aggiorniamo il file principale e ripuliamo eventuali duplicati per lasciare un unico file.
    const targetFile = existingFiles.find((f) => f.name === targetFilename) || existingFiles[0];

    if (targetFile) {
      if (targetFile.name !== targetFilename) {
        try {
          await this.fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${targetFile.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: targetFilename }),
          });
        } catch {
          // Ignora errori di rename non bloccanti
        }
      }

      const updateRes = await this.fetchWithAuth(
        `https://www.googleapis.com/upload/drive/v3/files/${targetFile.id}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'text/csv; charset=UTF-8',
          },
          body: csvContent,
        },
      );

      if (!updateRes.ok) {
        const errText = await updateRes.text();
        throw new Error(`Errore aggiornamento file su Drive: ${errText}`);
      }

      // Rimuoviamo eventuali file duplicati/vecchi nella cartella per non riempire Drive
      for (const extra of existingFiles) {
        if (extra.id !== targetFile.id) {
          try {
            await this.fetchWithAuth(`https://www.googleapis.com/drive/v3/files/${extra.id}`, {
              method: 'DELETE',
            });
          } catch {
            // Ignora errori di pulizia duplicati
          }
        }
      }

      return { id: targetFile.id, name: targetFilename };
    }

    // Se non esiste ancora alcun file nella cartella, creiamo prima il file e poi carichiamo il contenuto
    const createRes = await this.fetchWithAuth('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: targetFilename,
        parents: [folderId],
        mimeType: 'text/csv',
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`Errore creazione file su Drive: ${errText}`);
    }

    const createdJson = (await createRes.json()) as { id: string; name: string };
    const uploadRes = await this.fetchWithAuth(
      `https://www.googleapis.com/upload/drive/v3/files/${createdJson.id}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'text/csv; charset=UTF-8',
        },
        body: csvContent,
      },
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Errore caricamento dati su Drive: ${errText}`);
    }

    return { id: createdJson.id, name: targetFilename };
  }
}

export const googleDriveService = new GoogleDriveService();
