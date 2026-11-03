import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { StarredMessagesService } from '../../timeline/StarredMessagesService';
import type { StarredMessage } from '../../timeline/starredTypes';
import { startPromptManager } from '../index';
import { navigateToSavedLibraryItem } from '../savedLibraryActions';

vi.mock('webextension-polyfill', () => ({ default: globalThis.chrome }));
vi.mock('../../chatInput/index', () => ({ insertTextIntoChatInput: vi.fn(() => true) }));
vi.mock('../../timeline/StarredMessagesService', () => ({
  StarredMessagesService: {
    getAllStarredMessagesSorted: vi.fn(),
    removeStarredMessage: vi.fn(async () => {}),
  },
}));
vi.mock('../savedLibraryActions', () => ({
  loadCurrentAccountHighlightRecords: vi.fn(async () => []),
  navigateToSavedLibraryItem: vi.fn(() => true),
  removeStoredHighlight: vi.fn(async () => true),
  resolveCurrentHighlightScope: vi.fn(async () => null),
}));

const star = (turnId: string, title: string): StarredMessage => ({
  turnId,
  content: `content ${turnId}`,
  conversationId: `c-${turnId}`,
  conversationUrl: `https://gemini.google.com/app/c-${turnId}`,
  conversationTitle: title,
  starredAt: 1,
});

function storageGet(values: Record<string, unknown>): typeof chrome.storage.sync.get {
  const get = (
    keys: string | string[] | Record<string, unknown> | null = null,
    callback?: (items: Record<string, unknown>) => void,
  ) => {
    const names =
      keys === null
        ? Object.keys(values)
        : typeof keys === 'string'
          ? [keys]
          : Array.isArray(keys)
            ? keys
            : Object.keys(keys);
    const fallback = keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
    const result = Object.fromEntries(names.map((key) => [key, values[key] ?? fallback[key]]));
    callback?.(result);
    return Promise.resolve(result);
  };
  return get as unknown as typeof chrome.storage.sync.get;
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

let manager: Awaited<ReturnType<typeof startPromptManager>> | undefined;

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  vi.mocked(chrome.storage.sync.get).mockImplementation(
    storageGet({ [StorageKeys.LANGUAGE]: 'en', [StorageKeys.PROMPT_PANEL_VIEW]: 'starred' }),
  );
  vi.mocked(chrome.storage.local.get).mockImplementation(storageGet({}));
  vi.mocked(StarredMessagesService.getAllStarredMessagesSorted).mockResolvedValue([
    star('t1', 'First'),
    star('t2', 'Second'),
  ]);
  vi.spyOn(console, 'warn');
});

afterEach(() => {
  manager?.destroy();
  manager = undefined;
  vi.clearAllMocks();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('Saved Library in the Prompt Manager panel', () => {
  it('removes a starred message from its row and opens another from its row', async () => {
    manager = await startPromptManager();
    await flush();
    document.querySelector<HTMLButtonElement>('#gv-pm-trigger')!.click();
    await flush();

    const titles = () =>
      [...document.querySelectorAll('.gv-pm-starred-title')].map((el) => el.textContent);
    expect(titles()).toEqual(['First', 'Second']);

    document.querySelector<HTMLButtonElement>('.gv-pm-starred-remove')!.click();
    await flush();

    expect(StarredMessagesService.removeStarredMessage).toHaveBeenCalledExactlyOnceWith(
      'c-t1',
      't1',
    );
    expect(navigateToSavedLibraryItem).not.toHaveBeenCalled();
    expect(titles()).toEqual(['Second']);

    document.querySelector<HTMLButtonElement>('.gv-pm-starred-item')!.click();
    await flush();

    expect(navigateToSavedLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'starred', turnId: 't2' }),
    );
  });
});
