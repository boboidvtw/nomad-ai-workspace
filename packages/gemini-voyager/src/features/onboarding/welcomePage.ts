import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { getVoyagerBuildTarget } from '@/core/utils/browser';

export const WELCOME_PAGE_PATH = 'src/pages/welcome/index.html';

interface WelcomePageDeps {
  openTab: (url: string) => Promise<unknown>;
  hasShown: () => Promise<boolean>;
  markShown: () => Promise<void>;
  /** Safari puts every enabled extension in the toolbar and ships through the
   * Mac app, so the page has nothing to ask of a Safari user. */
  supported: () => boolean;
}

async function hasShownWelcomePage(): Promise<boolean> {
  const stored = await browser.storage.local.get({ [StorageKeys.WELCOME_PAGE_SHOWN]: false });
  return stored[StorageKeys.WELCOME_PAGE_SHOWN] === true;
}

async function markWelcomePageShown(): Promise<void> {
  await browser.storage.local.set({ [StorageKeys.WELCOME_PAGE_SHOWN]: true });
}

/**
 * Open the welcome page once, on a fresh install outside Safari. Updates and reloads keep
 * the changelog flow instead. The storage flag guards browsers that replay
 * `onInstalled` for the same profile (Safari can fire it on re-enable).
 */
export async function openWelcomePageOnInstall(
  reason: string,
  deps: WelcomePageDeps = {
    openTab: (url) => browser.tabs.create({ url }),
    hasShown: hasShownWelcomePage,
    markShown: markWelcomePageShown,
    supported: () => getVoyagerBuildTarget() !== 'safari',
  },
): Promise<boolean> {
  if (reason !== 'install' || !deps.supported()) return false;
  try {
    if (await deps.hasShown()) return false;
    await deps.markShown();
    await deps.openTab(chrome.runtime.getURL(WELCOME_PAGE_PATH));
    return true;
  } catch (error) {
    console.warn('[Onboarding] Failed to open the welcome page', error);
    return false;
  }
}

export function registerWelcomePageOnInstall(): void {
  chrome.runtime?.onInstalled?.addListener?.((details) => {
    void openWelcomePageOnInstall(details.reason);
  });
}
