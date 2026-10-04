import browser from 'webextension-polyfill';

import { isChrome, isEdge, isFirefox, isSafari } from '@/core/utils/browser';

/**
 * Which set of "pin Voyager to the toolbar" instructions applies. Safari shows
 * every enabled extension in the toolbar, so it has no pin step at all.
 */
export type ToolbarPinBrowser = 'chrome' | 'edge' | 'firefox' | 'unsupported';

export function detectToolbarPinBrowser(): ToolbarPinBrowser {
  if (isSafari()) return 'unsupported';
  if (isEdge()) return 'edge';
  if (isFirefox()) return 'firefox';
  if (isChrome()) return 'chrome';
  return 'unsupported';
}

interface ActionUserSettingsApi {
  getUserSettings?: () => Promise<{ isOnToolbar?: boolean } | undefined>;
  onUserSettingsChanged?: {
    addListener: (listener: (change: { isOnToolbar?: boolean }) => void) => void;
    removeListener: (listener: (change: { isOnToolbar?: boolean }) => void) => void;
  };
}

function getActionApi(): ActionUserSettingsApi | undefined {
  const polyfilled = (browser as unknown as { action?: ActionUserSettingsApi }).action;
  if (polyfilled?.getUserSettings) return polyfilled;
  return (globalThis as { chrome?: { action?: ActionUserSettingsApi } }).chrome?.action;
}

/**
 * Whether the user has pinned Voyager to the toolbar. `null` when the browser
 * cannot tell us (no `action.getUserSettings`, or the call failed), in which
 * case callers show the instructions without live feedback.
 */
export async function readToolbarPinState(): Promise<boolean | null> {
  const action = getActionApi();
  if (!action?.getUserSettings) return null;
  try {
    const settings = await action.getUserSettings();
    return typeof settings?.isOnToolbar === 'boolean' ? settings.isOnToolbar : null;
  } catch {
    return null;
  }
}

export const TOOLBAR_PIN_POLL_INTERVAL_MS = 1000;

/**
 * Follow the pin state until the icon lands on the toolbar. Newer Chromium
 * raises `action.onUserSettingsChanged`; elsewhere there is no event, and the
 * extension cannot pin itself, so polling is what turns the instructions into
 * a live checklist. Stops on its own once pinned or once the browser reports
 * that it cannot answer.
 */
export function watchToolbarPinState(
  onChange: (pinned: boolean | null) => void,
  intervalMs = TOOLBAR_PIN_POLL_INTERVAL_MS,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: boolean | null | undefined;

  const publish = (next: boolean | null) => {
    if (stopped || next === last) return;
    last = next;
    onChange(next);
  };

  const event = getActionApi()?.onUserSettingsChanged;
  const listener = (change: { isOnToolbar?: boolean }) => {
    if (typeof change?.isOnToolbar === 'boolean') publish(change.isOnToolbar);
  };
  let listening = false;
  try {
    event?.addListener(listener);
    listening = Boolean(event);
  } catch {
    listening = false;
  }

  const tick = async () => {
    const next = await readToolbarPinState();
    if (stopped) return;
    publish(next);
    if (next === false && !listening) {
      timer = setTimeout(() => void tick(), intervalMs);
    }
  };
  void tick();

  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
    if (listening) {
      try {
        event?.removeListener(listener);
      } catch {
        // Nothing to undo if the browser dropped the event.
      }
    }
  };
}
