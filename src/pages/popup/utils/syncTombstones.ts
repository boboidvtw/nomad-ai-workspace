import type { TombstoneLedger } from '@/core/services/syncTombstoneStore';
import type { FolderData } from '@/core/types/folder';
import type { PromptItem } from '@/core/types/sync';
import {
  applyTombstonesToFolderData,
  applyTombstonesToPrompts,
  applyTombstonesToStarred,
} from '@/core/utils/syncTombstones';
import type { StarredMessagesData } from '@/pages/content/timeline/starredTypes';

/** Ask the background to combine local and cloud tombstones and push them to the cloud. */
export async function reconcileSyncTombstones(): Promise<TombstoneLedger> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'nomad.sync.reconcileTombstones' });
    return response?.ok && response.ledger ? (response.ledger as TombstoneLedger) : {};
  } catch (error) {
    console.warn('[CloudSyncSettings] Tombstone reconcile failed:', error);
    return {};
  }
}

type MergeInputs = {
  localFolders: FolderData;
  cloudFolders: FolderData;
  localPrompts: PromptItem[];
  cloudPrompts: PromptItem[];
  localStarred: StarredMessagesData;
  cloudStarred: StarredMessagesData;
};

/**
 * Remove deleted items from both sides before the popup's merge restore, so
 * the merge does not bring them back. Ledger keys are the local storage keys.
 */
export function applyMergeTombstones(
  ledger: TombstoneLedger,
  keys: { folders: string; prompts: string; starred: string },
  inputs: MergeInputs,
): MergeInputs {
  const folders = ledger[keys.folders] ?? {};
  const prompts = ledger[keys.prompts] ?? {};
  const starred = ledger[keys.starred] ?? {};
  return {
    localFolders: applyTombstonesToFolderData(inputs.localFolders, folders),
    cloudFolders: applyTombstonesToFolderData(inputs.cloudFolders, folders),
    localPrompts: applyTombstonesToPrompts(inputs.localPrompts, prompts),
    cloudPrompts: applyTombstonesToPrompts(inputs.cloudPrompts, prompts),
    localStarred: applyTombstonesToStarred(inputs.localStarred, starred),
    cloudStarred: applyTombstonesToStarred(inputs.cloudStarred, starred),
  };
}
