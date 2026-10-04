import { beforeEach, describe, expect, it, vi } from 'vitest';

const polyfill = vi.hoisted(() => ({
  storage: { local: { get: vi.fn(), set: vi.fn() } },
  tabs: { create: vi.fn() },
}));

vi.mock('webextension-polyfill', () => ({ default: polyfill }));

import { StorageKeys } from '@/core/types/common';

import {
  WELCOME_PAGE_PATH,
  openWelcomePageOnInstall,
  registerWelcomePageOnInstall,
} from '../welcomePage';

describe('openWelcomePageOnInstall', () => {
  const deps = () => ({
    openTab: vi.fn().mockResolvedValue(undefined),
    hasShown: vi.fn().mockResolvedValue(false),
    markShown: vi.fn().mockResolvedValue(undefined),
    supported: vi.fn().mockReturnValue(true),
  });

  it('opens the welcome page on a fresh install only', async () => {
    const d = deps();
    expect(await openWelcomePageOnInstall('install', d)).toBe(true);
    expect(d.openTab).toHaveBeenCalledWith(expect.stringContaining('src/pages/welcome/index.html'));
    expect(d.markShown).toHaveBeenCalledTimes(1);

    const update = deps();
    expect(await openWelcomePageOnInstall('update', update)).toBe(false);
    expect(update.openTab).not.toHaveBeenCalled();
  });

  it('does not reopen the page for a profile that already saw it', async () => {
    const d = deps();
    d.hasShown.mockResolvedValue(true);
    expect(await openWelcomePageOnInstall('install', d)).toBe(false);
    expect(d.openTab).not.toHaveBeenCalled();
  });

  it('stays silent on Safari, where the toolbar needs no pin', async () => {
    const d = deps();
    d.supported.mockReturnValue(false);
    expect(await openWelcomePageOnInstall('install', d)).toBe(false);
    expect(d.openTab).not.toHaveBeenCalled();
    expect(d.markShown).not.toHaveBeenCalled();
  });

  it('marks the page as shown before opening so a failed tab cannot loop', async () => {
    const d = deps();
    d.openTab.mockRejectedValue(new Error('no tabs'));
    expect(await openWelcomePageOnInstall('install', d)).toBe(false);
    expect(d.markShown).toHaveBeenCalledTimes(1);
  });
});

describe('registerWelcomePageOnInstall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    polyfill.storage.local.get.mockResolvedValue({ [StorageKeys.WELCOME_PAGE_SHOWN]: false });
    polyfill.storage.local.set.mockResolvedValue(undefined);
    polyfill.tabs.create.mockResolvedValue({});
  });

  it('wires runtime.onInstalled to the welcome page with local-storage bookkeeping', async () => {
    registerWelcomePageOnInstall();
    const addListener = chrome.runtime.onInstalled.addListener as ReturnType<typeof vi.fn>;
    const listener = addListener.mock.calls.at(-1)?.[0] as (d: { reason: string }) => void;
    expect(listener).toBeTypeOf('function');

    listener({ reason: 'install' });
    await vi.waitFor(() => expect(polyfill.tabs.create).toHaveBeenCalledTimes(1));
    expect(polyfill.tabs.create).toHaveBeenCalledWith({
      url: chrome.runtime.getURL(WELCOME_PAGE_PATH),
    });
    expect(polyfill.storage.local.set).toHaveBeenCalledWith({
      [StorageKeys.WELCOME_PAGE_SHOWN]: true,
    });
  });
});
