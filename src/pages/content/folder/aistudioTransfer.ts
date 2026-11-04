/**
 * Pure pieces of AI Studio folder cloud sync. The flows that touch the data session
 * stay in the manager, which owns its account-switch guards.
 */
import browser from 'webextension-polyfill';

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
