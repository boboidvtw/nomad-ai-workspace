import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  addFolder,
  AIStudioFolderTree,
  type FolderTreeOptions,
  deleteFolderTree,
  moveConversationToFolder,
  removeConversationFromData,
  renameFolderInData,
  toggleConversationStar,
  toggleFolderFlag,
} from '../aistudioFolderTree';
import type { Folder, FolderData } from '../types';

const UNCATEGORIZED = '__uncategorized__';

function folder(id: string, extra: Partial<Folder> = {}): Folder {
  return { id, name: id, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1, ...extra };
}

function conv(id: string, extra: { starred?: boolean } = {}) {
  return { conversationId: id, title: id, url: `/prompts/${id}`, addedAt: 1, ...extra };
}

function sample(): FolderData {
  return {
    folders: [folder('f1'), folder('f2', { parentId: 'f1' }), folder('f3')],
    folderContents: { f1: [conv('p1')], f2: [conv('p2')], f3: [], [UNCATEGORIZED]: [conv('u1')] },
  };
}

function frozen(data: FolderData): FolderData {
  return JSON.parse(JSON.stringify(data)) as FolderData;
}

describe('folder data updates return new data', () => {
  it('adds a folder with an empty content list', () => {
    const data = sample();
    const before = frozen(data);

    const next = addFolder(data, folder('new'));

    expect(next.folders.map((f) => f.id)).toEqual(['f1', 'f2', 'f3', 'new']);
    expect(next.folderContents.new).toEqual([]);
    expect(data).toEqual(before);
  });

  it('renames one folder and stamps updatedAt', () => {
    const data = sample();
    const next = renameFolderInData(data, 'f3', 'Renamed', 99);

    expect(next.folders.find((f) => f.id === 'f3')).toMatchObject({
      name: 'Renamed',
      updatedAt: 99,
    });
    expect(data.folders.find((f) => f.id === 'f3')?.name).toBe('f3');
  });

  it('deletes a folder with its direct subfolders and their contents', () => {
    const data = sample();
    const next = deleteFolderTree(data, 'f1');

    expect(next.folders.map((f) => f.id)).toEqual(['f3']);
    expect(Object.keys(next.folderContents).sort()).toEqual([UNCATEGORIZED, 'f3'].sort());
    expect(data.folders).toHaveLength(3);
  });

  it('toggles a folder flag', () => {
    const data = sample();
    const next = toggleFolderFlag(toggleFolderFlag(data, 'f3', 'pinned'), 'f3', 'isExpanded');

    expect(next.folders.find((f) => f.id === 'f3')).toMatchObject({
      pinned: true,
      isExpanded: false,
    });
    expect(data.folders.find((f) => f.id === 'f3')?.pinned).toBeUndefined();
  });

  it('toggles a conversation star and removes a conversation', () => {
    const data = sample();

    expect(toggleConversationStar(data, 'f1', 'p1').folderContents.f1[0]?.starred).toBe(true);
    expect(removeConversationFromData(data, 'f1', 'p1').folderContents.f1).toEqual([]);
    expect(data.folderContents.f1).toEqual([conv('p1')]);
  });

  it('moves a conversation into a folder and out of every other folder', () => {
    const data = sample();
    const next = moveConversationToFolder(data, conv('u1'), 'f3', UNCATEGORIZED);

    expect(next.folderContents.f3.map((c) => c.conversationId)).toEqual(['u1']);
    expect(next.folderContents[UNCATEGORIZED]).toEqual([]);
    expect(data.folderContents[UNCATEGORIZED]).toHaveLength(1);
  });

  it('moves a conversation to uncategorized when dropped on the root', () => {
    const next = moveConversationToFolder(sample(), conv('p1'), null, UNCATEGORIZED);

    expect(next.folderContents.f1).toEqual([]);
    expect(next.folderContents[UNCATEGORIZED].map((c) => c.conversationId)).toEqual(['u1', 'p1']);
  });

  it('does not duplicate a conversation already in the target', () => {
    const next = moveConversationToFolder(sample(), conv('p1'), 'f1', UNCATEGORIZED);

    expect(next.folderContents.f1).toHaveLength(1);
  });
});

function setup(initial: FolderData = sample()) {
  let current = initial;
  const container = document.createElement('div');
  const list = document.createElement('div');
  list.className = 'gv-folder-list';
  container.appendChild(list);
  document.body.appendChild(container);
  const options: FolderTreeOptions = {
    t: (key) => key,
    getContainer: () => container,
    getData: () => current,
    setData: vi.fn((next: FolderData) => {
      current = next;
    }),
    canEdit: () => true,
    save: vi.fn().mockResolvedValue(true),
    render: vi.fn(() => tree.renderList(list)),
    navigateToPrompt: vi.fn(),
    uncategorizedKey: UNCATEGORIZED,
  };
  const tree = new AIStudioFolderTree(options);
  tree.renderList(list);
  return { tree, options, list, data: () => current };
}

function dropEvent(payload: object): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  const json = JSON.stringify(payload);
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: (type: string) => (type === 'application/json' ? json : '') },
  });
  return event;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AIStudioFolderTree rendering', () => {
  it('renders root folders, nested subfolders and the uncategorized section', () => {
    const { list } = setup();

    const ids = [...list.querySelectorAll<HTMLElement>('.gv-folder-item')].map(
      (el) => `${el.dataset.folderId}:${el.dataset.level}`,
    );
    expect(ids).toEqual(['f1:0', 'f2:1', 'f3:0']);
    expect(list.querySelector('.gv-folder-root-drop')).not.toBeNull();
    expect(
      list.querySelector(`.gv-folder-uncategorized [data-conversation-id="u1"]`),
    ).not.toBeNull();
  });

  it('opens a conversation through navigateToPrompt', () => {
    const { list, options } = setup();

    list.querySelector<HTMLElement>('[data-conversation-id="p1"]')!.click();

    expect(options.navigateToPrompt).toHaveBeenCalledWith('p1', '/prompts/p1');
  });
});

describe('AIStudioFolderTree editing', () => {
  it('creates a folder from the inline editor', async () => {
    const { tree, list, options, data } = setup();

    tree.createFolder();
    const input = list.querySelector<HTMLInputElement>('.gv-folder-inline-input input')!;
    input.value = '  New folder ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await vi.waitFor(() => expect(options.render).toHaveBeenCalled());

    expect(data().folders.at(-1)).toMatchObject({ name: 'New folder', parentId: null });
    expect(options.save).toHaveBeenCalledTimes(1);
  });

  it('renames a folder from the inline editor', async () => {
    const { tree, list, options, data } = setup();

    tree.renameFolder('f3');
    const input = list.querySelector<HTMLInputElement>('.gv-folder-rename-inline input')!;
    input.value = 'Better';
    list
      .querySelector<HTMLButtonElement>('.gv-folder-rename-inline .gv-folder-inline-save')!
      .click();
    await vi.waitFor(() => expect(options.render).toHaveBeenCalled());

    expect(data().folders.find((f) => f.id === 'f3')?.name).toBe('Better');
  });

  it('deletes a folder after confirmation', async () => {
    const { tree, options, data } = setup();

    tree.deleteFolder('f1');
    document.querySelector<HTMLButtonElement>('.gv-aistudio-confirm .gv-confirm-delete')!.click();
    await vi.waitFor(() => expect(options.render).toHaveBeenCalled());

    expect(data().folders.map((f) => f.id)).toEqual(['f3']);
    expect(document.querySelector('.gv-aistudio-confirm')).toBeNull();
  });

  it('files a dropped conversation into the folder header it lands on', async () => {
    const { list, options, data } = setup();
    const header = list.querySelector<HTMLElement>(
      '[data-folder-id="f3"] > .gv-folder-item-header',
    )!;

    header.dispatchEvent(
      dropEvent({ type: 'conversation', conversationId: 'u1', title: 'U', url: '/prompts/u1' }),
    );
    await vi.waitFor(() => expect(options.render).toHaveBeenCalled());

    expect(data().folderContents.f3.map((c) => c.conversationId)).toEqual(['u1']);
    expect(data().folderContents[UNCATEGORIZED]).toEqual([]);
  });

  it('ignores edits while editing is locked', () => {
    const { tree, options, list } = setup();
    options.canEdit = () => false;

    tree.createFolder();

    expect(list.querySelector('.gv-folder-inline-input')).toBeNull();
    expect(options.setData).not.toHaveBeenCalled();
  });
});
