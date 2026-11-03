import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getResponseCompleteNotificationTabId,
  getTabDedupKey,
  normalizeNotificationText,
  showResponseCompleteNotification,
} from '../responseCompleteNotifications';

const { createNotification } = vi.hoisted(() => ({ createNotification: vi.fn() }));

vi.mock('webextension-polyfill', () => ({
  default: {
    notifications: { create: createNotification, clear: vi.fn() },
    tabs: { query: vi.fn(), update: vi.fn(), create: vi.fn() },
    windows: { update: vi.fn() },
    runtime: { connectNative: vi.fn() },
  },
}));
vi.mock('@/core/utils/notificationsPermission', () => ({
  hasNotificationsPermission: vi.fn(async () => true),
}));
vi.mock('@/utils/i18n', () => ({
  getTranslation: vi.fn(async () => 'Response complete'),
}));

describe('normalizeNotificationText', () => {
  it('collapses whitespace and drops the "You said" label Gemini puts before a prompt', () => {
    expect(normalizeNotificationText('​You said:\n  write   a poem ', 100)).toBe('write a poem');
  });

  it('cuts long text to the limit, ending with an ellipsis', () => {
    expect(normalizeNotificationText('abcdefghij', 5)).toBe('abcd…');
  });

  it('reads anything that is not a string as empty', () => {
    expect(normalizeNotificationText(42, 10)).toBe('');
    expect(normalizeNotificationText('   ', 10)).toBe('');
  });
});

describe('getTabDedupKey', () => {
  it('keys on the tab and the conversation, falling back to the tab URL', () => {
    expect(getTabDedupKey(7, 'https://a/tab', 'https://a/c/1')).toBe('7:https://a/c/1');
    expect(getTabDedupKey(7, 'https://a/tab')).toBe('7:https://a/tab');
    expect(getTabDedupKey(undefined, undefined)).toBe('unknown:');
  });
});

describe('getResponseCompleteNotificationTabId', () => {
  it('reads the tab id back out of a notification id', () => {
    expect(getResponseCompleteNotificationTabId('gv-response-complete-42-1700000000000')).toBe(42);
  });

  it('gives nothing for a notification without a tab id', () => {
    expect(getResponseCompleteNotificationTabId('gv-response-complete-unknown-1')).toBeUndefined();
    expect(getResponseCompleteNotificationTabId('other-42-1')).toBeUndefined();
  });
});

describe('showResponseCompleteNotification', () => {
  const syncGet = chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createNotification.mockReset();
    syncGet.mockReset();
  });

  it('shows nothing while the setting is off', async () => {
    syncGet.mockResolvedValue({ gvResponseCompleteNotificationEnabled: false });

    const shown = await showResponseCompleteNotification({ tab: { id: 1 } as chrome.tabs.Tab }, {});

    expect(shown).toBe(false);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('names the conversation and the prompt, and shows one notification per burst', async () => {
    syncGet.mockImplementation(async (defaults: Record<string, unknown>) =>
      Object.fromEntries(Object.keys(defaults).map((key) => [key, true])),
    );
    const sender = { tab: { id: 5, url: 'https://gemini.google.com/app/x' } as chrome.tabs.Tab };
    const details = {
      conversationUrl: 'https://gemini.google.com/app/x',
      conversationTitle: 'Math',
      userPrompt: 'You said 2+3?',
    };

    expect(await showResponseCompleteNotification(sender, details)).toBe(true);
    expect(await showResponseCompleteNotification(sender, details)).toBe(true);

    expect(createNotification).toHaveBeenCalledTimes(1);
    const [id, options] = createNotification.mock.calls[0];
    expect(id).toMatch(/^gv-response-complete-5-\d+$/);
    expect(options).toMatchObject({
      title: 'Gemini Voyager - Math',
      message: 'Response complete: 2+3?',
    });
  });
});
