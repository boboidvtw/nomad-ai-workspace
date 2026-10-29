/**
 * Local ledger of sync deletion tombstones, recorded from storage changes.
 *
 * The background worker watches the synced data keys in `chrome.storage.local`.
 * When an item disappears from one of them, its id is tombstoned under that
 * storage key. Recording at the storage level catches every deletion path
 * (sidebar, prompt panel, popup) without touching each one.
 *
 * Writes made by a sync carry SYNC_WRITE_MARKER_KEY in the same `set()` call,
 * so items a merge or an overwrite restore removes are not recorded as user
 * deletions.
 */
import { StorageKeys } from '@/core/types/common';
import {
  type Tombstones,
  collectTrackedIds,
  mergeTombstones,
  pruneTombstones,
  recordRemovedIds,
} from '@/core/utils/syncTombstones';

export const TOMBSTONE_LEDGER_KEY = 'nomadSyncTombstones';
export const SYNC_WRITE_MARKER_KEY = 'nomadSyncWriteMarker';

export type TombstoneLedger = Record<string, Tombstones>;

/**
 * Emptying at least this many items in one write is treated as a reset or a
 * migration rather than user deletions, so a wipe cannot spread to every device.
 */
const MASS_RESET_MIN_ITEMS = 10;

const TRACKED_BASE_KEYS = [
  StorageKeys.FOLDER_DATA,
  StorageKeys.FOLDER_DATA_AISTUDIO,
  StorageKeys.PROMPT_ITEMS,
  StorageKeys.TIMELINE_STARRED_MESSAGES,
  'claude_nexus_folders',
  'chatgpt_folders',
  'grok_folders',
] as const;

export function isTrackedSyncKey(key: string): boolean {
  return TRACKED_BASE_KEYS.some((base) => key === base || key.startsWith(`${base}:acct:`));
}

type StorageChange = { oldValue?: unknown; newValue?: unknown };

/** The ledger after applying one storage change set, or null when it does not change. */
export function computeTombstoneLedgerUpdate(
  changes: Record<string, StorageChange>,
  ledger: TombstoneLedger,
  now: number,
): TombstoneLedger | null {
  if (Object.prototype.hasOwnProperty.call(changes, SYNC_WRITE_MARKER_KEY)) return null;

  let next: TombstoneLedger | null = null;
  Object.entries(changes).forEach(([key, change]) => {
    // A removed key is a reset or a migration, not the user deleting every item.
    if (!isTrackedSyncKey(key) || change.newValue === undefined) return;
    const previousIds = collectTrackedIds(change.oldValue);
    const nextIds = collectTrackedIds(change.newValue);
    if (nextIds.length === 0 && previousIds.length >= MASS_RESET_MIN_ITEMS) return;
    const current = (next ?? ledger)[key] ?? {};
    const updated = recordRemovedIds(previousIds, nextIds, current, now);
    if (JSON.stringify(updated) === JSON.stringify(current)) return;
    next = { ...(next ?? ledger), [key]: updated };
  });
  return next;
}

export async function loadTombstoneLedger(): Promise<TombstoneLedger> {
  const result = await chrome.storage.local.get(TOMBSTONE_LEDGER_KEY);
  const value = result?.[TOMBSTONE_LEDGER_KEY];
  return typeof value === 'object' && value !== null ? (value as TombstoneLedger) : {};
}

export async function saveTombstoneLedger(ledger: TombstoneLedger, now: number): Promise<void> {
  const pruned = Object.fromEntries(
    Object.entries(ledger).map(([key, set]) => [key, pruneTombstones(set, now)]),
  );
  await chrome.storage.local.set({ [TOMBSTONE_LEDGER_KEY]: pruned });
}

/** Merge tombstones from the cloud into the local ledger and return the combined ledger. */
export function mergeTombstoneLedgers(...ledgers: Array<TombstoneLedger | null>): TombstoneLedger {
  const keys = new Set(ledgers.flatMap((ledger) => Object.keys(ledger ?? {})));
  return Object.fromEntries(
    Array.from(keys).map((key) => [key, mergeTombstones(...ledgers.map((l) => l?.[key]))]),
  );
}

/** Values to pass to `chrome.storage.local.set` alongside sync-driven data writes. */
export function syncWriteMarker(): Record<string, number> {
  return { [SYNC_WRITE_MARKER_KEY]: Date.now() };
}

let recorderQueue: Promise<void> = Promise.resolve();

/** Background only: record user deletions from storage changes into the ledger. */
export function startSyncTombstoneRecorder(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (!Object.keys(changes).some(isTrackedSyncKey)) return;
    recorderQueue = recorderQueue
      .then(async () => {
        const now = Date.now();
        const next = computeTombstoneLedgerUpdate(changes, await loadTombstoneLedger(), now);
        if (next) await saveTombstoneLedger(next, now);
      })
      .catch((error) => console.warn('[SyncTombstones] Failed to record deletions:', error));
  });
}
