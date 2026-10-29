import type { GoogleDriveSyncService } from '@/core/services/GoogleDriveSyncService';
import type { PlatformFolderPayload } from '@/core/services/platformFolderFiles';
import {
  type TombstoneLedger,
  loadTombstoneLedger,
  mergeTombstoneLedgers,
  saveTombstoneLedger,
  syncWriteMarker,
} from '@/core/services/syncTombstoneStore';
import type { FolderData } from '@/core/types/folder';
import {
  TOMBSTONE_FILE_FORMAT,
  type Tombstones,
  applyTombstonesToFlatFolders,
  applyTombstonesToFolderData,
  pruneTombstones,
} from '@/core/utils/syncTombstones';
import { type FlatSyncFolder, mergeFlatFolders, mergeFolderData } from '@/utils/merge';

/** The slice of GoogleDriveSyncService the per-platform folder sync needs. */
export type PlatformFolderSyncService = Pick<
  GoogleDriveSyncService,
  | 'getState'
  | 'uploadClaudeFolders'
  | 'downloadClaudeFolders'
  | 'uploadChatGPTFolders'
  | 'downloadChatGPTFolders'
  | 'uploadGeminiFolders'
  | 'downloadGeminiFolders'
  | 'uploadGrokFolders'
  | 'downloadGrokFolders'
  | 'downloadTombstones'
  | 'uploadTombstones'
>;

type UploadMethod =
  | 'uploadClaudeFolders'
  | 'uploadChatGPTFolders'
  | 'uploadGeminiFolders'
  | 'uploadGrokFolders';
type DownloadMethod =
  | 'downloadClaudeFolders'
  | 'downloadChatGPTFolders'
  | 'downloadGeminiFolders'
  | 'downloadGrokFolders';

/** Runtime message type → Drive call. `cv.sync.*` are the legacy Claude-only names. */
const UPLOAD_MESSAGES: Record<string, UploadMethod> = {
  'cv.sync.upload': 'uploadClaudeFolders',
  'nomad.sync.uploadClaude': 'uploadClaudeFolders',
  'nomad.sync.uploadChatGPT': 'uploadChatGPTFolders',
  'nomad.sync.uploadGemini': 'uploadGeminiFolders',
  'nomad.sync.uploadGrok': 'uploadGrokFolders',
};

const DOWNLOAD_MESSAGES: Record<string, DownloadMethod> = {
  'cv.sync.download': 'downloadClaudeFolders',
  'nomad.sync.downloadClaude': 'downloadClaudeFolders',
  'nomad.sync.downloadChatGPT': 'downloadChatGPTFolders',
  'nomad.sync.downloadGemini': 'downloadGeminiFolders',
  'nomad.sync.downloadGrok': 'downloadGrokFolders',
};

type PlatformFolderSyncMessage = {
  type: string;
  payload?: { interactive?: boolean; folders?: unknown[] };
};

/** Handle one per-platform folder upload/download message and build its response. */
export async function handlePlatformFolderSyncMessage(
  service: PlatformFolderSyncService,
  message: PlatformFolderSyncMessage,
) {
  const interactive = message.payload?.interactive !== false;
  const upload = UPLOAD_MESSAGES[message.type];
  if (upload) {
    const success = await service[upload](message.payload?.folders ?? [], interactive);
    return { ok: success, state: await service.getState() };
  }
  const download = DOWNLOAD_MESSAGES[message.type];
  if (!download) throw new Error(`Not a platform folder sync message: ${message.type}`);
  const data = await service[download](interactive);
  return { ok: data !== null, data, state: await service.getState() };
}

function isFolderData(value: unknown): value is FolderData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as { folders?: unknown; folderContents?: unknown };
  return (
    Array.isArray(data.folders) &&
    typeof data.folderContents === 'object' &&
    data.folderContents !== null
  );
}

function extractFlatFolders(raw: unknown): FlatSyncFolder[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as FlatSyncFolder[];
  if (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as { folders?: unknown }).folders)
  ) {
    return (raw as { folders: FlatSyncFolder[] }).folders;
  }
  return [];
}

function toFolderData(raw: unknown): FolderData {
  return isFolderData(raw)
    ? raw
    : {
        folders: Array.isArray(raw) ? (raw as FolderData['folders']) : [],
        folderContents: {},
      };
}

function mergeFlat(
  local: FlatSyncFolder[],
  cloud: PlatformFolderPayload | null,
  tombstones: Tombstones,
): FlatSyncFolder[] {
  const kept = applyTombstonesToFlatFolders(local, tombstones);
  if (cloud === null) return kept;
  return mergeFlatFolders(
    kept,
    applyTombstonesToFlatFolders(extractFlatFolders(cloud), tombstones),
  );
}

function mergeGemini(
  local: FolderData,
  cloud: PlatformFolderPayload | null,
  tombstones: Tombstones,
): FolderData {
  const kept = applyTombstonesToFolderData(local, tombstones);
  if (cloud === null) return kept;
  return mergeFolderData(kept, applyTombstonesToFolderData(toFolderData(cloud), tombstones));
}

function prunedLedger(ledger: TombstoneLedger, now: number): TombstoneLedger {
  return Object.fromEntries(
    Object.entries(ledger)
      .map(([key, set]) => [key, pruneTombstones(set, now)] as const)
      .filter(([, set]) => Object.keys(set).length > 0),
  );
}

/**
 * Combine this device's deletion tombstones with the cloud copy, save the
 * result locally and upload it, so every device learns every deletion.
 */
export async function reconcileTombstoneLedger(
  service: Pick<PlatformFolderSyncService, 'downloadTombstones' | 'uploadTombstones'>,
  interactive: boolean,
): Promise<TombstoneLedger> {
  const cloud = await service.downloadTombstones(interactive);
  const now = Date.now();
  const ledger = prunedLedger(
    mergeTombstoneLedgers(await loadTombstoneLedger(), cloud?.datasets ?? null),
    now,
  );
  await saveTombstoneLedger(ledger, now);
  await service.uploadTombstones({ format: TOMBSTONE_FILE_FORMAT, datasets: ledger }, interactive);
  return ledger;
}

/**
 * Two-way folder sync for all four platforms: download every platform's Drive
 * file, merge it with local storage, save the result locally (which live-refreshes
 * open tabs through storage.onChanged), upload it back, then ping open tabs.
 */
export async function syncAllPlatformFolders(
  service: PlatformFolderSyncService,
  interactive: boolean,
) {
  const [claudeCloud, chatgptCloud, geminiCloud, grokCloud, ledger] = await Promise.all([
    service.downloadClaudeFolders(interactive),
    service.downloadChatGPTFolders(interactive),
    service.downloadGeminiFolders(interactive),
    service.downloadGrokFolders(interactive),
    reconcileTombstoneLedger(service, interactive),
  ]);
  const tombstonesFor = (key: string): Tombstones => ledger[key] ?? {};

  const localStore = await chrome.storage.local.get([
    'claude_nexus_folders',
    'chatgpt_folders',
    'grok_folders',
    'gvFolderData',
  ]);
  const localGemini = toFolderData(localStore.gvFolderData);

  const claude = mergeFlat(
    (localStore.claude_nexus_folders || []) as FlatSyncFolder[],
    claudeCloud,
    tombstonesFor('claude_nexus_folders'),
  );
  const chatgpt = mergeFlat(
    (localStore.chatgpt_folders || []) as FlatSyncFolder[],
    chatgptCloud,
    tombstonesFor('chatgpt_folders'),
  );
  const grok = mergeFlat(
    (localStore.grok_folders || []) as FlatSyncFolder[],
    grokCloud,
    tombstonesFor('grok_folders'),
  );
  const gemini = mergeGemini(localGemini, geminiCloud, tombstonesFor('gvFolderData'));

  await chrome.storage.local.set({
    claude_nexus_folders: claude,
    chatgpt_folders: chatgpt,
    grok_folders: grok,
    gvFolderData: gemini,
    ...syncWriteMarker(),
  });

  await Promise.all([
    service.uploadClaudeFolders(claude, interactive),
    service.uploadChatGPTFolders(chatgpt, interactive),
    // Full FolderData, not just `folders`: folderContents carries conversation membership.
    service.uploadGeminiFolders(gemini, interactive),
    service.uploadGrokFolders(grok, interactive),
  ]);

  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'nomad.sync.refreshed' }).catch(() => {});
      }
    }
  } catch {}

  return { claude, chatgpt, gemini, grok };
}
