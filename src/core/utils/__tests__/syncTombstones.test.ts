/**
 * Tests for sync deletion tombstones: recording local deletions and applying
 * them to local and cloud copies before a merge, so a merge no longer brings
 * back items that were deleted on this or another device.
 */
import { describe, expect, it } from 'vitest';

import {
  TOMBSTONE_MAX_AGE_MS,
  applyTombstonesToFlatFolders,
  applyTombstonesToFolderData,
  applyTombstonesToPrompts,
  applyTombstonesToStarred,
  collectTrackedIds,
  isTombstoneFile,
  mergeTombstones,
  pruneTombstones,
  recordRemovedIds,
} from '../syncTombstones';

describe('recordRemovedIds', () => {
  it('marks ids that disappeared with the deletion time', () => {
    expect(recordRemovedIds(['a', 'b', 'c'], ['a'], {}, 500)).toEqual({ b: 500, c: 500 });
  });

  it('clears the mark when an id comes back (undo or re-create)', () => {
    expect(recordRemovedIds(['a'], ['a', 'b'], { b: 100, x: 7 }, 500)).toEqual({ x: 7 });
  });

  it('keeps existing marks for ids that are still absent', () => {
    expect(recordRemovedIds(['a'], ['a'], { gone: 42 }, 500)).toEqual({ gone: 42 });
  });
});

describe('mergeTombstones', () => {
  it('keeps the latest deletion time for each id and skips missing sets', () => {
    expect(mergeTombstones({ a: 1, b: 9 }, null, { a: 5, c: 2 }, undefined)).toEqual({
      a: 5,
      b: 9,
      c: 2,
    });
  });
});

describe('pruneTombstones', () => {
  it('drops marks older than the maximum age', () => {
    const now = TOMBSTONE_MAX_AGE_MS + 1000;
    expect(pruneTombstones({ old: 999, fresh: 1000 }, now)).toEqual({ fresh: 1000 });
  });
});

describe('applyTombstonesToPrompts', () => {
  const prompts = [
    { id: 'p1', text: 'one', tags: [], createdAt: 1, updatedAt: 10 },
    { id: 'p2', text: 'two', tags: [], createdAt: 1, updatedAt: 300 },
    { id: 'p3', text: 'three', tags: [], createdAt: 1 },
  ];

  it('removes deleted prompts but keeps one edited after the deletion', () => {
    const result = applyTombstonesToPrompts(prompts, { 'prompt:p1': 200, 'prompt:p2': 200 });
    expect(result.map((p) => p.id)).toEqual(['p2', 'p3']);
  });
});

describe('applyTombstonesToFolderData', () => {
  const data = {
    folders: [
      { id: 'f1', name: 'Work', parentId: null, createdAt: 1, updatedAt: 10 },
      { id: 'f2', name: 'Sub', parentId: 'f1', createdAt: 1, updatedAt: 10 },
      { id: 'f3', name: 'Keep', parentId: null, createdAt: 1, updatedAt: 10 },
    ],
    folderContents: {
      f1: [{ conversationId: 'c1', addedAt: 1 }],
      f3: [
        { conversationId: 'c2', addedAt: 1 },
        { conversationId: 'c3', addedAt: 900 },
      ],
    },
  };

  it('drops deleted folders and their contents, and lifts orphaned children to the root', () => {
    const result = applyTombstonesToFolderData(data, { 'folder:f1': 100 });
    expect(result.folders.map((f) => [f.id, f.parentId])).toEqual([
      ['f2', null],
      ['f3', null],
    ]);
    expect(result.folderContents.f1).toBeUndefined();
  });

  it('removes a conversation from a folder unless it was re-added later', () => {
    const result = applyTombstonesToFolderData(data, {
      'conv:f3/c2': 100,
      'conv:f3/c3': 100,
    });
    expect(result.folderContents.f3.map((c) => c.conversationId)).toEqual(['c3']);
  });

  it('does not change the input', () => {
    applyTombstonesToFolderData(data, { 'folder:f1': 100 });
    expect(data.folders).toHaveLength(3);
  });
});

describe('applyTombstonesToFlatFolders', () => {
  it('drops deleted folders and deleted conversation ids', () => {
    const folders = [
      { id: 'a', name: 'A', conversationIds: ['x', 'y'], updatedAt: 10 },
      { id: 'b', name: 'B', conversationIds: [], updatedAt: 10 },
    ];
    const result = applyTombstonesToFlatFolders(folders, { 'folder:b': 50, 'conv:a/x': 50 });
    expect(result).toEqual([{ id: 'a', name: 'A', conversationIds: ['y'], updatedAt: 10 }]);
  });
});

describe('applyTombstonesToStarred', () => {
  it('drops unstarred messages unless starred again later and removes empty conversations', () => {
    const starred = {
      messages: {
        c1: [{ turnId: 't1', starredAt: 10 }],
        c2: [
          { turnId: 't2', starredAt: 10 },
          { turnId: 't3', starredAt: 900 },
        ],
      },
    };
    const result = applyTombstonesToStarred(starred, {
      'star:c1/t1': 100,
      'star:c2/t2': 100,
      'star:c2/t3': 100,
    });
    expect(result).toEqual({ messages: { c2: [{ turnId: 't3', starredAt: 900 }] } });
  });
});

describe('collectTrackedIds', () => {
  it('lists folder, membership, prompt and starred ids per stored shape', () => {
    expect(
      collectTrackedIds({
        folders: [{ id: 'f1' }],
        folderContents: { f1: [{ conversationId: 'c1' }] },
      }).sort(),
    ).toEqual(['conv:f1/c1', 'folder:f1']);
    expect(collectTrackedIds([{ id: 'a', conversationIds: ['x'] }]).sort()).toEqual([
      'conv:a/x',
      'folder:a',
    ]);
    expect(collectTrackedIds([{ id: 'p1', text: 't', tags: [], createdAt: 1 }])).toEqual([
      'prompt:p1',
    ]);
    expect(collectTrackedIds({ messages: { c1: [{ turnId: 't1' }] } })).toEqual(['star:c1/t1']);
    expect(collectTrackedIds('garbage')).toEqual([]);
  });
});

describe('isTombstoneFile', () => {
  it('accepts only a versioned map of numeric deletion times', () => {
    expect(isTombstoneFile({ format: 'nomad.sync.tombstones.v1', datasets: { k: { a: 1 } } })).toBe(
      true,
    );
    expect(
      isTombstoneFile({ format: 'nomad.sync.tombstones.v1', datasets: { k: { a: 'x' } } }),
    ).toBe(false);
    expect(isTombstoneFile({ datasets: {} })).toBe(false);
  });
});
