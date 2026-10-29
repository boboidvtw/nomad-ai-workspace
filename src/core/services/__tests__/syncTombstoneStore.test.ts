/**
 * Tests for the storage-level deletion recorder: which keys are tracked, how a
 * storage change turns into tombstones, and that sync writes are not recorded.
 */
import { describe, expect, it } from 'vitest';

import {
  SYNC_WRITE_MARKER_KEY,
  computeTombstoneLedgerUpdate,
  isTrackedSyncKey,
} from '../syncTombstoneStore';

describe('isTrackedSyncKey', () => {
  it('tracks synced data keys and their account-scoped variants', () => {
    expect(isTrackedSyncKey('gvFolderData')).toBe(true);
    expect(isTrackedSyncKey('gvFolderData:acct:abc123')).toBe(true);
    expect(isTrackedSyncKey('gvPromptItems')).toBe(true);
    expect(isTrackedSyncKey('claude_nexus_folders')).toBe(true);
    expect(isTrackedSyncKey('geminiTimelineStarredMessages')).toBe(true);
  });

  it('ignores unrelated keys and look-alike prefixes', () => {
    expect(isTrackedSyncKey('gvFolderDataBackup')).toBe(false);
    expect(isTrackedSyncKey('gvSyncMode')).toBe(false);
  });
});

describe('computeTombstoneLedgerUpdate', () => {
  const prompts = (ids: string[]) => ids.map((id) => ({ id, text: id, tags: [], createdAt: 1 }));

  it('records ids removed from a tracked key under that key', () => {
    const ledger = computeTombstoneLedgerUpdate(
      { gvPromptItems: { oldValue: prompts(['a', 'b']), newValue: prompts(['a']) } },
      {},
      1000,
    );
    expect(ledger).toEqual({ gvPromptItems: { 'prompt:b': 1000 } });
  });

  it('returns null when nothing tracked changed', () => {
    expect(computeTombstoneLedgerUpdate({ gvSyncMode: { newValue: 'auto' } }, {}, 1)).toBeNull();
  });

  it('skips writes made by a sync (marked in the same change set)', () => {
    const ledger = computeTombstoneLedgerUpdate(
      {
        gvPromptItems: { oldValue: prompts(['a', 'b']), newValue: prompts(['a']) },
        [SYNC_WRITE_MARKER_KEY]: { newValue: 5 },
      },
      {},
      1000,
    );
    expect(ledger).toBeNull();
  });

  it('treats emptying a large dataset in one write as a reset, not a deletion', () => {
    const many = prompts(Array.from({ length: 10 }, (_, i) => `p${i}`));
    expect(
      computeTombstoneLedgerUpdate({ gvPromptItems: { oldValue: many, newValue: [] } }, {}, 1000),
    ).toBeNull();
  });

  it('still records deleting the last few items', () => {
    const ledger = computeTombstoneLedgerUpdate(
      { gvPromptItems: { oldValue: prompts(['only']), newValue: [] } },
      {},
      1000,
    );
    expect(ledger).toEqual({ gvPromptItems: { 'prompt:only': 1000 } });
  });

  it('does not treat a wiped key as deleting everything', () => {
    const ledger = computeTombstoneLedgerUpdate(
      { gvPromptItems: { oldValue: prompts(['a', 'b']), newValue: undefined } },
      {},
      1000,
    );
    expect(ledger).toBeNull();
  });
});
