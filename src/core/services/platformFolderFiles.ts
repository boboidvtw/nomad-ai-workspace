import type { FolderData } from '@/core/types/folder';
import type { SyncState } from '@/core/types/sync';

export type FolderSyncPlatform = 'Claude' | 'ChatGPT' | 'Gemini' | 'Grok';

/**
 * Body of a per-platform folder file's `data` field. Claude/ChatGPT/Grok store a flat
 * folder list; Gemini stores the full FolderData (folders + folderContents). Older
 * Gemini uploads were a bare folder array, so readers must accept both shapes.
 */
export type PlatformFolderPayload = unknown[] | FolderData;

/** Per-platform folder file under "Nomad Workspace/<Platform>/" and the state fields it updates. */
export const PLATFORM_FOLDER_FILES: Record<
  FolderSyncPlatform,
  {
    fileName: string;
    format: string;
    uploadTimeKey: keyof SyncState;
    syncTimeKey: keyof SyncState;
  }
> = {
  Claude: {
    fileName: 'claude-folders.json',
    format: 'nomad.claude.folders.v1',
    uploadTimeKey: 'lastUploadTimeClaude',
    syncTimeKey: 'lastSyncTimeClaude',
  },
  ChatGPT: {
    fileName: 'chatgpt-folders.json',
    format: 'nomad.chatgpt.folders.v1',
    uploadTimeKey: 'lastUploadTimeChatGPT',
    syncTimeKey: 'lastSyncTimeChatGPT',
  },
  Gemini: {
    fileName: 'gemini-folders.json',
    format: 'nomad.gemini.folders.v1',
    uploadTimeKey: 'lastUploadTime',
    syncTimeKey: 'lastSyncTime',
  },
  Grok: {
    fileName: 'grok-folders.json',
    format: 'nomad.grok.folders.v1',
    uploadTimeKey: 'lastUploadTimeGrok',
    syncTimeKey: 'lastSyncTimeGrok',
  },
};
