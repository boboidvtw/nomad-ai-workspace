import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { syncPromptNudgeIcon } from '../promptNudgeIcon';

const { syncGet } = vi.hoisted(() => ({ syncGet: vi.fn() }));

vi.mock('webextension-polyfill', () => ({
  default: { storage: { sync: { get: syncGet } } },
}));

const originalDeclarativeContent = Object.getOwnPropertyDescriptor(chrome, 'declarativeContent');

describe('syncPromptNudgeIcon', () => {
  const removeRules = vi.fn((_ids: unknown, done: () => void) => done());
  const addRules = vi.fn();

  beforeEach(() => {
    removeRules.mockClear();
    addRules.mockClear();
    syncGet.mockReset();
    Object.defineProperty(chrome, 'declarativeContent', {
      value: {
        onPageChanged: { removeRules, addRules },
        PageStateMatcher: class {},
        SetIcon: class {},
      },
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalDeclarativeContent) {
      Object.defineProperty(chrome, 'declarativeContent', originalDeclarativeContent);
    } else {
      Reflect.deleteProperty(chrome, 'declarativeContent');
    }
  });

  it('does nothing where declarativeContent is missing (Firefox, Safari)', async () => {
    Reflect.deleteProperty(chrome, 'declarativeContent');

    await syncPromptNudgeIcon(new Set(['chatgpt.com']));

    expect(syncGet).not.toHaveBeenCalled();
  });

  it('clears the dot once every plugin site has the Prompt Manager on', async () => {
    syncGet.mockResolvedValue({ gvPromptCustomWebsites: ['ChatGPT.com'] });

    await syncPromptNudgeIcon(new Set(['chatgpt.com']));

    expect(removeRules).toHaveBeenCalledTimes(1);
    expect(addRules).not.toHaveBeenCalled();
  });

  it('adds no rule when the icon with the dot cannot be drawn', async () => {
    // jsdom has no OffscreenCanvas, as some browsers do not.
    syncGet.mockResolvedValue({ gvPromptCustomWebsites: [] });

    await syncPromptNudgeIcon(new Set(['chatgpt.com']));

    expect(removeRules).toHaveBeenCalledTimes(1);
    expect(addRules).not.toHaveBeenCalled();
  });

  it('treats an unreadable site list as no site enabled, without throwing', async () => {
    syncGet.mockRejectedValue(new Error('storage down'));

    await expect(syncPromptNudgeIcon(new Set(['claude.ai']))).resolves.toBeUndefined();
    expect(removeRules).toHaveBeenCalledTimes(1);
  });
});
