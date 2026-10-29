/**
 * The popup merge restore applies the tombstones stored under each local
 * storage key to both the local and the cloud side before merging.
 */
import { describe, expect, it } from 'vitest';

import { applyMergeTombstones } from '../syncTombstones';

const folder = (id: string) => ({
  id,
  name: id,
  parentId: null,
  isExpanded: true,
  createdAt: 1,
  updatedAt: 1,
});
const prompt = (id: string) => ({ id, text: id, tags: [], createdAt: 1 });

describe('applyMergeTombstones', () => {
  it('uses the tombstones of the given keys on both sides', () => {
    const result = applyMergeTombstones(
      {
        'gvFolderData:acct:x': { 'folder:f2': 100 },
        gvPromptItems: { 'prompt:p2': 100 },
        geminiTimelineStarredMessages: {},
        gvFolderData: { 'folder:f1': 100 },
      },
      {
        folders: 'gvFolderData:acct:x',
        prompts: 'gvPromptItems',
        starred: 'geminiTimelineStarredMessages',
      },
      {
        localFolders: { folders: [folder('f1'), folder('f2')], folderContents: {} },
        cloudFolders: { folders: [folder('f2')], folderContents: {} },
        localPrompts: [prompt('p1')],
        cloudPrompts: [prompt('p1'), prompt('p2')],
        localStarred: { messages: {} },
        cloudStarred: { messages: {} },
      },
    );

    expect(result.localFolders.folders.map((f) => f.id)).toEqual(['f1']);
    expect(result.cloudFolders.folders).toEqual([]);
    expect(result.cloudPrompts.map((p) => p.id)).toEqual(['p1']);
  });

  it('leaves data unchanged when the ledger has nothing for the keys', () => {
    const inputs = {
      localFolders: { folders: [folder('f1')], folderContents: {} },
      cloudFolders: { folders: [], folderContents: {} },
      localPrompts: [prompt('p1')],
      cloudPrompts: [],
      localStarred: { messages: {} },
      cloudStarred: { messages: {} },
    };
    expect(applyMergeTombstones({}, { folders: 'a', prompts: 'b', starred: 'c' }, inputs)).toEqual(
      inputs,
    );
  });
});
