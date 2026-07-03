import type { Folder } from './folder';
import type { Prompt } from './prompt';

export type SyncMode = 'disabled' | 'manual' | 'auto';

export interface SyncState {
  mode: SyncMode;
  lastSyncTime: number | null;
  lastUploadTime: number | null;
  isSyncing: boolean;
  error: string | null;
  isAuthenticated: boolean;
}

export interface FolderExportPayload {
  format: 'claude-voyager.folders.v1';
  exportedAt: string;
  version: string;
  data: Folder[];
}

export interface PromptExportPayload {
  format: 'claude-voyager.prompts.v1';
  exportedAt: string;
  version: string;
  items: Prompt[];
}

export interface SyncData {
  version: string;
  format: 'claude-voyager.sync.v1';
  folders: FolderExportPayload;
  prompts: PromptExportPayload;
  syncedAt: number;
}

export const SyncStorageKeys = {
  MODE: 'cvSyncMode',
  LAST_SYNC_TIME: 'cvLastSyncTime',
  LAST_UPLOAD_TIME: 'cvLastUploadTime',
  SYNC_ERROR: 'cvSyncError',
  ACCESS_TOKEN: 'cvAccessToken',
  TOKEN_EXPIRY: 'cvTokenExpiry',
} as const;

export const DEFAULT_SYNC_STATE: SyncState = {
  mode: 'disabled',
  lastSyncTime: null,
  lastUploadTime: null,
  isSyncing: false,
  error: null,
  isAuthenticated: false,
};

export type SyncMessageType =
  | 'cv.sync.authenticate'
  | 'cv.sync.signOut'
  | 'cv.sync.upload'
  | 'cv.sync.download'
  | 'cv.sync.getState'
  | 'cv.sync.setMode';

export interface SyncMessage {
  type: SyncMessageType;
  payload?: {
    mode?: SyncMode;
    interactive?: boolean;
    folders?: Folder[];
    prompts?: Prompt[];
  };
}

export interface SyncResponse {
  ok: boolean;
  error?: string;
  state?: SyncState;
  data?: SyncData;
}
