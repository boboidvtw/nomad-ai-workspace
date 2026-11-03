/**
 * Pure pieces of AI Studio folder import, export and cloud sync. The flows that touch
 * the data session stay in the manager, which owns its account-switch guards.
 */
import browser from 'webextension-polyfill';

import type { FolderData } from './types';

type Translate = (key: string) => string;

const CLOUD_TOOLTIP_KEYS = {
  upload: {
    label: 'folder_cloud_upload',
    last: 'lastUploaded',
    never: 'neverUploaded',
    stateField: 'lastUploadTime',
  },
  sync: {
    label: 'folder_cloud_sync',
    last: 'lastSynced',
    never: 'neverSynced',
    stateField: 'lastSyncTime',
  },
} as const;

/**
 * Format a timestamp as relative time (e.g. "5 minutes ago")
 */
export function formatRelativeTime(
  timestamp: number | null,
  t: Translate,
  nowMs: number = Date.now(),
): string {
  if (!timestamp) return '';
  const diffMs = nowMs - timestamp;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return t('justNow');
  } else if (diffMins < 60) {
    return `${diffMins} ${t('minutesAgo')}`;
  } else if (diffHours < 24) {
    return `${diffHours} ${t('hoursAgo')}`;
  } else if (diffDays === 1) {
    return t('yesterday');
  } else {
    return new Date(timestamp).toLocaleDateString();
  }
}

/**
 * Tooltip for the cloud upload or sync button, with the last time it ran.
 * Falls back to the plain label when the background cannot report its state.
 */
export async function getCloudTooltip(kind: 'upload' | 'sync', t: Translate): Promise<string> {
  const keys = CLOUD_TOOLTIP_KEYS[kind];
  try {
    const response = (await browser.runtime.sendMessage({ type: 'gv.sync.getState' })) as
      | { ok?: boolean; state?: Partial<Record<typeof keys.stateField, number | null>> }
      | undefined;
    if (response?.ok && response.state) {
      const lastTime = response.state[keys.stateField];
      const timeStr = formatRelativeTime(lastTime ?? null, t);
      const baseTooltip = t(keys.label);
      return lastTime
        ? `${baseTooltip}\n${t(keys.last).replace('{time}', timeStr)}`
        : `${baseTooltip}\n${t(keys.never)}`;
    }
  } catch (e) {
    console.warn('[AIStudioFolderManager] Failed to get sync state for tooltip:', e);
  }
  return t(keys.label);
}

/**
 * Merge an imported file into the current folders: new folders are added, and
 * folders both sides have keep their conversations plus any the file adds.
 * Neither input is modified.
 */
export function mergeImportedFolderData(base: FolderData, incoming: FolderData): FolderData {
  const folders = [...base.folders];
  const folderContents = { ...base.folderContents };
  const existingIds = new Set(folders.map((x) => x.id));
  for (const f of incoming.folders) {
    if (!existingIds.has(f.id)) {
      folders.push(f);
      folderContents[f.id] = [...(incoming.folderContents[f.id] || [])];
    } else {
      // Merge conversations
      const merged = [...(folderContents[f.id] || [])];
      const seen = new Set(merged.map((c) => c.conversationId));
      for (const c of incoming.folderContents[f.id] || []) {
        if (!seen.has(c.conversationId)) merged.push(c);
      }
      folderContents[f.id] = merged;
    }
  }
  return { ...base, folders, folderContents };
}

/** Local time as YYYYMMDD-HHMMSS, for export file names. */
export function exportTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
