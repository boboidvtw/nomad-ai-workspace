/**
 * Google Drive Sync Service for Claude-Voyager
 * Uses Chrome Identity API for OAuth2 and Drive REST API v3 for storage
 */
import type { Folder } from '@src/types/folder';
import type { Prompt } from '@src/types/prompt';
import type {
  FolderExportPayload,
  PromptExportPayload,
  SyncMode,
  SyncState,
} from '@src/types/sync';
import {
  DEFAULT_SYNC_STATE,
  SyncStorageKeys,
} from '@src/types/sync';
import manifest from '../../manifest.json';

const FOLDERS_FILE_NAME = 'claude-voyager-folders.json';
const PROMPTS_FILE_NAME = 'claude-voyager-prompts.json';
const BACKUP_FOLDER_NAME = 'Claude Voyager Data';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const IDENTITY_TOKEN_TTL_SECONDS = 55 * 60;

const EXTENSION_VERSION = manifest.version;

const isBrave = (): boolean => {
  return typeof navigator !== 'undefined' && 'brave' in navigator;
};

export class GoogleDriveSyncService {
  private state: SyncState = { ...DEFAULT_SYNC_STATE };
  private backupFolderId: string | null = null;
  private fileIdByName: Record<string, string> = {};
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private stateLoadPromise: Promise<void> | null = null;
  private stateChangeCallback: ((state: SyncState) => void) | null = null;

  constructor() {
    this.stateLoadPromise = this.loadState();
  }

  onStateChange(callback: (state: SyncState) => void): void {
    this.stateChangeCallback = callback;
  }

  async getState(): Promise<SyncState> {
    if (this.stateLoadPromise) {
      await this.stateLoadPromise;
    }
    return { ...this.state };
  }

  async setMode(mode: SyncMode): Promise<void> {
    this.state.mode = mode;
    await this.saveState();
    this.notifyStateChange();
  }

  async authenticate(interactive: boolean = true): Promise<boolean> {
    try {
      this.updateState({ isSyncing: true, error: null });
      const token = await this.getAuthToken(interactive);
      if (!token) {
        if (!interactive) {
          this.updateState({ isAuthenticated: false, isSyncing: false });
          return false;
        }
        throw new Error('Failed to obtain auth token');
      }
      this.updateState({ isAuthenticated: true, isSyncing: false });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      console.error('[GoogleDriveSyncService] Authentication failed:', error);
      this.updateState({ isAuthenticated: false, isSyncing: false, error: errorMessage });
      return false;
    }
  }

  async signOut(): Promise<void> {
    try {
      if (this.accessToken) {
        await this.removeCachedAuthToken(this.accessToken);
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${this.accessToken}`);
      }
    } catch (error) {
      console.warn('[GoogleDriveSyncService] Sign out warning:', error);
    }
    await this.clearToken();
    this.backupFolderId = null;
    this.fileIdByName = {};
    this.updateState({ isAuthenticated: false, lastSyncTime: null, lastUploadTime: null, error: null });
    await this.saveState();
  }

  async upload(
    folders: Folder[],
    prompts: Prompt[],
    interactive: boolean = true,
  ): Promise<boolean> {
    try {
      this.updateState({ isSyncing: true, error: null });

      const token = await this.getAuthToken(interactive);
      if (!token) {
        if (!interactive) {
          console.log('[GoogleDriveSyncService] Upload skipped: Not authenticated');
          this.updateState({ isSyncing: false, isAuthenticated: false });
          return false;
        }
        throw new Error('Not authenticated');
      }

      const now = new Date();

      const folderPayload: FolderExportPayload = {
        format: 'claude-voyager.folders.v1',
        exportedAt: now.toISOString(),
        version: EXTENSION_VERSION,
        data: folders,
      };

      const promptPayload: PromptExportPayload = {
        format: 'claude-voyager.prompts.v1',
        exportedAt: now.toISOString(),
        version: EXTENSION_VERSION,
        items: prompts,
      };

      const folderFileId = await this.ensureFileId(token, FOLDERS_FILE_NAME, 'folders');
      await this.uploadFileWithRetry(token, folderFileId, folderPayload);

      const promptsFileId = await this.ensureFileId(token, PROMPTS_FILE_NAME, 'prompts');
      await this.uploadFileWithRetry(token, promptsFileId, promptPayload);

      const uploadTime = Date.now();
      this.updateState({ isSyncing: false, lastUploadTime: uploadTime, error: null });
      await this.saveState();

      console.log('[GoogleDriveSyncService] Upload successful');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      console.error('[GoogleDriveSyncService] Upload failed:', error);
      this.updateState({ isSyncing: false, error: errorMessage });
      return false;
    }
  }

  async download(
    interactive: boolean = true,
  ): Promise<{
    folders: FolderExportPayload | null;
    prompts: PromptExportPayload | null;
  } | null> {
    try {
      this.updateState({ isSyncing: true, error: null });

      const token = await this.getAuthToken(interactive);
      if (!token) {
        if (!interactive) {
          console.log('[GoogleDriveSyncService] Download skipped: Not authenticated');
          this.updateState({ isSyncing: false, isAuthenticated: false });
          return null;
        }
        throw new Error('Not authenticated');
      }

      const foldersFileId = await this.findFile(token, FOLDERS_FILE_NAME);
      let folders: FolderExportPayload | null = null;
      if (foldersFileId) {
        folders = await this.downloadFileWithRetry<FolderExportPayload>(token, foldersFileId);
      }

      const promptsFileId = await this.findFile(token, PROMPTS_FILE_NAME);
      let prompts: PromptExportPayload | null = null;
      if (promptsFileId) {
        prompts = await this.downloadFileWithRetry<PromptExportPayload>(token, promptsFileId);
      }

      if (!folders && !prompts) {
        console.log('[GoogleDriveSyncService] No sync files found');
        this.updateState({ isSyncing: false });
        return null;
      }

      const syncTime = Date.now();
      this.updateState({ isSyncing: false, lastSyncTime: syncTime, error: null });
      await this.saveState();

      return { folders, prompts };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      console.error('[GoogleDriveSyncService] Download failed:', error);
      this.updateState({ isSyncing: false, error: errorMessage });
      return null;
    }
  }

  private async getAuthToken(interactive: boolean): Promise<string | null> {
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    if (this.accessToken && this.tokenExpiry <= Date.now()) {
      this.accessToken = null;
      this.tokenExpiry = 0;
    }

    await this.loadCachedToken();
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    const supportsIdentityApi = !!chrome.identity?.getAuthToken && !isBrave();
    if (supportsIdentityApi) {
      const identityResult = await this.getTokenFromIdentity(interactive);
      if (identityResult.token) {
        return identityResult.token;
      }

      if (!interactive) {
        return null;
      }
    }

    return this.getTokenFromLegacyWebAuthFlow();
  }

  private async getTokenFromIdentity(
    interactive: boolean,
  ): Promise<{ token: string | null; userDenied: boolean }> {
    if (!chrome.identity?.getAuthToken) {
      return { token: null, userDenied: false };
    }

    const nonInteractiveResult = await this.requestIdentityAuthToken(false);
    if (nonInteractiveResult.token) {
      return nonInteractiveResult;
    }

    if (!interactive) {
      return { token: null, userDenied: false };
    }

    return this.requestIdentityAuthToken(true);
  }

  private async requestIdentityAuthToken(
    interactive: boolean,
  ): Promise<{ token: string | null; userDenied: boolean }> {
    const identity = chrome.identity;
    if (!identity?.getAuthToken) {
      return { token: null, userDenied: false };
    }

    try {
      const tokenResult = await new Promise<unknown>((resolve, reject) => {
        identity.getAuthToken({ interactive }, (token) => {
          if (chrome.runtime?.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(token);
          }
        });
      });

      const token = typeof tokenResult === 'string' ? tokenResult : null;
      if (!token) {
        return { token: null, userDenied: false };
      }

      await this.saveToken(token, IDENTITY_TOKEN_TTL_SECONDS);
      return { token, userDenied: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const userDenied = message.toLowerCase().includes('user denied') || message.toLowerCase().includes('canceled');
      if (!userDenied) {
        console.warn('[GoogleDriveSyncService] identity.getAuthToken failed:', error);
      }
      return { token: null, userDenied };
    }
  }

  private async removeCachedAuthToken(token: string): Promise<void> {
    const identity = chrome.identity;
    if (!identity?.removeCachedAuthToken) {
      return;
    }

    await new Promise<void>((resolve) => {
      identity.removeCachedAuthToken({ token }, () => resolve());
    });
  }

  private async getTokenFromLegacyWebAuthFlow(): Promise<string | null> {
    const manifest = chrome.runtime.getManifest();
    const clientId = manifest.oauth2?.client_id;
    const scopes = manifest.oauth2?.scopes?.join(' ');

    if (!clientId || !scopes) {
      console.error('[GoogleDriveSyncService] Missing oauth2 config');
      return null;
    }

    const redirectUrl = chrome.identity.getRedirectURL();
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUrl);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', scopes);

    try {
      const responseUrl = await new Promise<string>((resolve, reject) => {
        chrome.identity.launchWebAuthFlow(
          { url: authUrl.toString(), interactive: true },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response) {
              resolve(response);
            } else {
              reject(new Error('No response from auth flow'));
            }
          },
        );
      });

      const url = new URL(responseUrl);
      const hashParams = new URLSearchParams(url.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const expiresIn = parseInt(hashParams.get('expires_in') || '3600', 10);

      if (accessToken) {
        await this.saveToken(accessToken, expiresIn);
        return accessToken;
      }
      return null;
    } catch (error) {
      console.error('[GoogleDriveSyncService] Auth flow failed:', error);
      return null;
    }
  }

  private async ensureFileId(
    token: string,
    fileName: string,
    _type: 'folders' | 'prompts',
  ): Promise<string> {
    const folderId = await this.ensureBackupFolder(token);
    const currentId = this.fileIdByName[fileName] ?? null;

    if (currentId) {
      const parents = await this.getFileParents(token, currentId);
      if (parents) {
        if (!parents.includes(folderId)) {
          await this.moveFile(token, currentId, folderId, parents);
        }
        return currentId;
      }
    }

    const existingId = await this.findFile(token, fileName);
    if (existingId) {
      this.fileIdByName[fileName] = existingId;
      const parents = await this.getFileParents(token, existingId);
      if (parents && !parents.includes(folderId)) {
        await this.moveFile(token, existingId, folderId, parents);
      }
      return existingId;
    }

    const newId = await this.createFile(token, fileName, folderId);
    this.fileIdByName[fileName] = newId;
    return newId;
  }

  private async ensureBackupFolder(token: string): Promise<string> {
    if (this.backupFolderId) {
      const exists = await this.checkFileExists(token, this.backupFolderId);
      if (exists) return this.backupFolderId;
    }

    const query = encodeURIComponent(
      `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    );
    const url = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id)`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Failed to search for backup folder');

    const data = await response.json();
    const existingId = data.files?.[0]?.id;

    if (existingId) {
      this.backupFolderId = existingId;
      return existingId;
    }

    const metadata = {
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    };
    const createResponse = await fetch(`${DRIVE_API_BASE}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!createResponse.ok) throw new Error('Failed to create backup folder');
    const folderData = await createResponse.json();
    this.backupFolderId = folderData.id;
    return folderData.id;
  }

  private async getFileParents(token: string, fileId: string): Promise<string[] | null> {
    try {
      const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?fields=parents,trashed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 404) return null;
      if (!response.ok) return null;
      const data = await response.json();
      if (data.trashed) return null;
      return data.parents || [];
    } catch {
      return null;
    }
  }

  private async moveFile(
    token: string,
    fileId: string,
    targetFolderId: string,
    currentParents: string[],
  ): Promise<void> {
    const previousParents = currentParents.join(',');
    const url = `${DRIVE_API_BASE}/files/${fileId}?addParents=${targetFolderId}&removeParents=${previousParents}&fields=id,parents`;
    await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  private async checkFileExists(token: string, fileId: string): Promise<boolean> {
    try {
      const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?fields=id`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async findFile(token: string, fileName: string): Promise<string | null> {
    const query = encodeURIComponent(`name='${fileName}' and trashed=false`);
    const url = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id)`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const data = await response.json();
    return data.files?.[0]?.id || null;
  }

  private async createFile(token: string, fileName: string, parentId?: string): Promise<string> {
    const metadata: { name: string; mimeType: string; parents?: string[] } = {
      name: fileName,
      mimeType: 'application/json',
    };
    if (parentId) {
      metadata.parents = [parentId];
    }

    const response = await fetch(`${DRIVE_API_BASE}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    if (!response.ok) {
      throw new Error(`Failed to create file: ${response.status}`);
    }
    const result = await response.json();
    return result.id;
  }

  private async uploadFileWithRetry(token: string, fileId: string, data: unknown): Promise<void> {
    let delay = INITIAL_RETRY_DELAY_MS;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const url = `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media`;
        const response = await fetch(url, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }
        return;
      } catch (error) {
        if (attempt === MAX_RETRIES) throw error;
        await this.sleep(delay);
        delay *= 2;
      }
    }
  }

  private async downloadFileWithRetry<T>(token: string, fileId: string): Promise<T | null> {
    let delay = INITIAL_RETRY_DELAY_MS;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const url = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error(`Download failed: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        if (attempt === MAX_RETRIES) throw error;
        await this.sleep(delay);
        delay *= 2;
      }
    }
    return null;
  }

  private async loadState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        SyncStorageKeys.MODE,
        SyncStorageKeys.LAST_SYNC_TIME,
        SyncStorageKeys.LAST_UPLOAD_TIME,
        SyncStorageKeys.SYNC_ERROR,
      ]);
      this.state = {
        mode: (result[SyncStorageKeys.MODE] as SyncMode) || 'disabled',
        lastSyncTime: typeof result[SyncStorageKeys.LAST_SYNC_TIME] === 'number' ? result[SyncStorageKeys.LAST_SYNC_TIME] : null,
        lastUploadTime: typeof result[SyncStorageKeys.LAST_UPLOAD_TIME] === 'number' ? result[SyncStorageKeys.LAST_UPLOAD_TIME] : null,
        error: typeof result[SyncStorageKeys.SYNC_ERROR] === 'string' ? result[SyncStorageKeys.SYNC_ERROR] : null,
        isSyncing: false,
        isAuthenticated: false,
      };
      if (this.state.mode !== 'disabled') {
        const token = await this.getAuthToken(false);
        this.state.isAuthenticated = !!token;
      }
    } catch (error) {
      console.error('[GoogleDriveSyncService] Failed to load state:', error);
    }
  }

  private async saveState(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [SyncStorageKeys.MODE]: this.state.mode,
        [SyncStorageKeys.LAST_SYNC_TIME]: this.state.lastSyncTime,
        [SyncStorageKeys.LAST_UPLOAD_TIME]: this.state.lastUploadTime,
        [SyncStorageKeys.SYNC_ERROR]: this.state.error,
      });
    } catch (error) {
      console.error('[GoogleDriveSyncService] Failed to save state:', error);
    }
  }

  private updateState(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial };
    this.notifyStateChange();
  }

  private notifyStateChange(): void {
    if (this.stateChangeCallback) {
      this.stateChangeCallback({ ...this.state });
    }
  }

  private async saveToken(token: string, expiresInSeconds: number): Promise<void> {
    this.accessToken = token;
    this.tokenExpiry = Date.now() + expiresInSeconds * 1000;
    try {
      await chrome.storage.local.set({
        [SyncStorageKeys.ACCESS_TOKEN]: token,
        [SyncStorageKeys.TOKEN_EXPIRY]: this.tokenExpiry,
      });
    } catch (error) {
      console.error('[GoogleDriveSyncService] Failed to save token:', error);
    }
  }

  private async loadCachedToken(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        SyncStorageKeys.ACCESS_TOKEN,
        SyncStorageKeys.TOKEN_EXPIRY,
      ]);
      this.accessToken = typeof result[SyncStorageKeys.ACCESS_TOKEN] === 'string' ? result[SyncStorageKeys.ACCESS_TOKEN] : null;
      this.tokenExpiry = typeof result[SyncStorageKeys.TOKEN_EXPIRY] === 'number' ? result[SyncStorageKeys.TOKEN_EXPIRY] : 0;
    } catch {
      this.accessToken = null;
      this.tokenExpiry = 0;
    }
  }

  private async clearToken(): Promise<void> {
    this.accessToken = null;
    this.tokenExpiry = 0;
    try {
      await chrome.storage.local.remove([
        SyncStorageKeys.ACCESS_TOKEN,
        SyncStorageKeys.TOKEN_EXPIRY,
      ]);
    } catch (error) {
      console.error('[GoogleDriveSyncService] Failed to clear token:', error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const googleDriveSyncService = new GoogleDriveSyncService();
