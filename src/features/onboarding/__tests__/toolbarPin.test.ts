import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const polyfill = vi.hoisted(() => ({ action: undefined as unknown }));

vi.mock('webextension-polyfill', () => ({ default: polyfill }));

import { detectToolbarPinBrowser, readToolbarPinState, watchToolbarPinState } from '../toolbarPin';

function setUserAgent(ua: string, vendor = 'Google Inc.') {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  vi.spyOn(navigator, 'vendor', 'get').mockReturnValue(vendor);
}

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

describe('detectToolbarPinBrowser', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps each browser to its pin instructions', () => {
    setUserAgent(CHROME_UA);
    expect(detectToolbarPinBrowser()).toBe('chrome');

    setUserAgent(`${CHROME_UA} Edg/128.0.0.0`);
    expect(detectToolbarPinBrowser()).toBe('edge');

    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0',
      '',
    );
    expect(detectToolbarPinBrowser()).toBe('firefox');
  });

  it('has no pin step on Safari, where the icon is always in the toolbar', () => {
    setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Apple Computer, Inc.',
    );
    expect(detectToolbarPinBrowser()).toBe('unsupported');
  });
});

describe('readToolbarPinState', () => {
  afterEach(() => {
    polyfill.action = undefined;
  });

  it('returns null when the browser cannot report the toolbar state', async () => {
    polyfill.action = {};
    expect(await readToolbarPinState()).toBeNull();

    polyfill.action = { getUserSettings: vi.fn().mockRejectedValue(new Error('nope')) };
    expect(await readToolbarPinState()).toBeNull();

    polyfill.action = { getUserSettings: vi.fn().mockResolvedValue({}) };
    expect(await readToolbarPinState()).toBeNull();
  });

  it('reads isOnToolbar from action.getUserSettings', async () => {
    polyfill.action = { getUserSettings: vi.fn().mockResolvedValue({ isOnToolbar: true }) };
    expect(await readToolbarPinState()).toBe(true);
  });
});

describe('watchToolbarPinState', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    polyfill.action = undefined;
  });

  it('polls until the icon is pinned, reporting only changes, then stops', async () => {
    const answers = [false, false, true, false];
    const getUserSettings = vi.fn(async () => ({ isOnToolbar: answers.shift() ?? true }));
    polyfill.action = { getUserSettings };
    const onChange = vi.fn();

    watchToolbarPinState(onChange, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(false);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(true);

    await vi.advanceTimersByTimeAsync(5000);
    expect(getUserSettings).toHaveBeenCalledTimes(3);
  });

  it('stops polling when the returned function is called', async () => {
    const getUserSettings = vi.fn(async () => ({ isOnToolbar: false }));
    polyfill.action = { getUserSettings };

    const stop = watchToolbarPinState(vi.fn(), 1000);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(getUserSettings).toHaveBeenCalledTimes(1);
  });

  it('prefers action.onUserSettingsChanged over polling when the browser has it', async () => {
    const listeners = new Set<(change: { isOnToolbar?: boolean }) => void>();
    const getUserSettings = vi.fn(async () => ({ isOnToolbar: false }));
    polyfill.action = {
      getUserSettings,
      onUserSettingsChanged: {
        addListener: (fn: (change: { isOnToolbar?: boolean }) => void) => listeners.add(fn),
        removeListener: (fn: (change: { isOnToolbar?: boolean }) => void) => listeners.delete(fn),
      },
    };
    const onChange = vi.fn();

    const stop = watchToolbarPinState(onChange, 1000);
    await vi.advanceTimersByTimeAsync(3000);
    expect(getUserSettings).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(1);

    for (const fn of listeners) fn({ isOnToolbar: true });
    expect(onChange).toHaveBeenLastCalledWith(true);

    stop();
    expect(listeners.size).toBe(0);
  });
});
