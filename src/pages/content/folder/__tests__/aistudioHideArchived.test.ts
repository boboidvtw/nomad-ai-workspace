import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import {
  AIStudioHideArchived,
  collectArchivedConversationIds,
  hasAnyArchivedConversation,
  unhideArchivedRows,
} from '../aistudioHideArchived';
import type { FolderData } from '../types';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: { sync: { get: vi.fn(), set: vi.fn() } },
    runtime: { id: 'test-extension-id' },
  },
}));

const syncGet = vi.mocked(browser.storage.sync.get);
const syncSet = vi.mocked(browser.storage.sync.set);

const UNCATEGORIZED = '__uncategorized__';
const ENABLED_KEY = 'aistudioFolderHideArchivedConversations';
const NUDGE_KEY = 'aistudioFolderHideArchivedNudgeShown';

function conv(id: string) {
  return { conversationId: id, title: id, url: `/prompts/${id}`, addedAt: 1 };
}

function data(contents: FolderData['folderContents']): FolderData {
  return { folders: [], folderContents: contents };
}

function libraryRow(promptId: string): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.className = 'mat-mdc-row';
  const anchor = document.createElement('a');
  anchor.setAttribute('href', `/prompts/${promptId}`);
  row.appendChild(anchor);
  document.body.appendChild(row);
  return row;
}

function create(folderData: FolderData, container: HTMLElement | null = null) {
  return new AIStudioHideArchived({
    getData: () => folderData,
    getContainer: () => container,
    uncategorizedKey: UNCATEGORIZED,
  });
}

beforeEach(() => {
  syncGet.mockReset();
  syncSet.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  document.body.innerHTML = '';
  window.history.pushState({}, '', '/');
});

describe('archived conversation helpers', () => {
  it('counts only conversations filed into real folders', () => {
    const folderData = data({ [UNCATEGORIZED]: [conv('u1')], f1: [conv('a1'), conv('a2')] });

    expect([...collectArchivedConversationIds(folderData, UNCATEGORIZED)]).toEqual(['a1', 'a2']);
    expect(hasAnyArchivedConversation(folderData, UNCATEGORIZED)).toBe(true);
    expect(hasAnyArchivedConversation(data({ [UNCATEGORIZED]: [conv('u1')] }), UNCATEGORIZED)).toBe(
      false,
    );
  });
});

describe('AIStudioHideArchived settings', () => {
  it('loads both AI Studio flags from sync storage', async () => {
    syncGet.mockResolvedValue({ [ENABLED_KEY]: true, [NUDGE_KEY]: true });
    const hideArchived = create(data({}));

    await hideArchived.load();

    expect(hideArchived.enabled).toBe(true);
    expect(hideArchived.nudgeShown).toBe(true);
  });

  it('falls back to off when storage fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    syncGet.mockRejectedValue(new Error('boom'));
    const hideArchived = create(data({}));
    hideArchived.enabled = true;

    await hideArchived.load();

    expect(hideArchived.enabled).toBe(false);
    expect(hideArchived.nudgeShown).toBe(false);
  });

  it('persists the enabled flag and the nudge flag', async () => {
    const hideArchived = create(data({}));

    await hideArchived.setEnabled(true);
    await hideArchived.markNudgeShown();

    expect(hideArchived.enabled).toBe(true);
    expect(hideArchived.nudgeShown).toBe(true);
    expect(syncSet).toHaveBeenCalledWith({ [ENABLED_KEY]: true });
    expect(syncSet).toHaveBeenCalledWith({ [NUDGE_KEY]: true });
  });
});

describe('AIStudioHideArchived library table', () => {
  it('hides filed rows only on /library while enabled', () => {
    const archived = libraryRow('a1');
    const free = libraryRow('free');
    const hideArchived = create(data({ f1: [conv('a1')] }));
    hideArchived.enabled = true;

    hideArchived.applyToLibraryTable();
    expect(archived.classList.contains('gv-conversation-archived')).toBe(false);

    window.history.pushState({}, '', '/library');
    hideArchived.applyToLibraryTable();
    expect(archived.classList.contains('gv-conversation-archived')).toBe(true);
    expect(free.classList.contains('gv-conversation-archived')).toBe(false);

    hideArchived.applyStoredEnabled(false);
    expect(archived.classList.contains('gv-conversation-archived')).toBe(false);
  });

  it('unhides every row it hid', () => {
    const row = libraryRow('a1');
    row.classList.add('gv-conversation-archived');

    unhideArchivedRows();

    expect(row.classList.contains('gv-conversation-archived')).toBe(false);
  });
});

describe('AIStudioHideArchived nudge', () => {
  it('mounts only with a filed conversation and unmounts once shown', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const hideArchived = create(data({ f1: [conv('a1')] }), container);

    hideArchived.updateNudgeVisibility();
    expect(container.querySelector('.gv-hide-archived-nudge--aistudio')).not.toBeNull();

    hideArchived.applyStoredNudgeShown(true);
    expect(container.querySelector('.gv-hide-archived-nudge')).toBeNull();
  });

  it('stays hidden while nothing is filed', () => {
    const container = document.createElement('div');
    const hideArchived = create(data({ [UNCATEGORIZED]: [conv('u1')] }), container);

    hideArchived.updateNudgeVisibility();

    expect(container.querySelector('.gv-hide-archived-nudge')).toBeNull();
  });
});
