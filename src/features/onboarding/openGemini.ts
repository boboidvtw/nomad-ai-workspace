import browser from 'webextension-polyfill';

export const GEMINI_APP_URL = 'https://gemini.google.com/app';
const GEMINI_TAB_PATTERN = 'https://gemini.google.com/*';

/**
 * Bring the user to Gemini so the in-page coachmark tour can take over.
 * A tab that was open before the install has no content script yet, so it is
 * reloaded; the user asked for this by pressing the button, which is the
 * explicit acceptance the repository requires for a full reload.
 */
export async function focusOrOpenGemini(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({ url: [GEMINI_TAB_PATTERN] });
    const existing = tabs.find((tab) => typeof tab.id === 'number');
    if (existing && typeof existing.id === 'number') {
      await browser.tabs.update(existing.id, { active: true });
      if (typeof existing.windowId === 'number') {
        await browser.windows.update(existing.windowId, { focused: true });
      }
      await browser.tabs.reload(existing.id);
      return;
    }
  } catch {
    // Querying by URL can be refused; fall through to a fresh tab.
  }
  await browser.tabs.create({ url: GEMINI_APP_URL });
}
