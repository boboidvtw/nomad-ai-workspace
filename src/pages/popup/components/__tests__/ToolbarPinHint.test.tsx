import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

const { polyfill, pinState } = vi.hoisted(() => ({
  polyfill: { storage: { local: { get: vi.fn(), set: vi.fn() } } },
  pinState: {
    current: { browser: 'chrome', ready: true, pinned: false } as {
      browser: string;
      ready: boolean;
      pinned: boolean | null;
    },
  },
}));

vi.mock('webextension-polyfill', () => ({ default: polyfill }));
vi.mock('@/features/onboarding/useToolbarPinState', () => ({
  useToolbarPinState: () => pinState.current,
}));
vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn(), t: (key: string) => key }),
}));

import { ToolbarPinHint } from '../ToolbarPinHint';

describe('ToolbarPinHint', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    polyfill.storage.local.get.mockResolvedValue({
      [StorageKeys.TOOLBAR_PIN_HINT_DISMISSED]: false,
    });
    polyfill.storage.local.set.mockResolvedValue(undefined);
    pinState.current = { browser: 'chrome', ready: true, pinned: false };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async () => {
    await act(async () => {
      root.render(<ToolbarPinHint />);
    });
  };

  it('reminds an unpinned user and goes away when dismissed', async () => {
    await render();
    expect(container.textContent).toContain('popupPinHint');

    const dismiss = container.querySelector<HTMLButtonElement>(
      'button[aria-label="popupPinHintDismiss"]',
    );
    expect(dismiss).not.toBeNull();
    await act(async () => {
      dismiss?.click();
    });
    expect(container.textContent).not.toContain('popupPinHint');
    expect(polyfill.storage.local.set).toHaveBeenCalledWith({
      [StorageKeys.TOOLBAR_PIN_HINT_DISMISSED]: true,
    });
  });

  it('stays hidden once dismissed, once pinned, and on browsers without a pin step', async () => {
    polyfill.storage.local.get.mockResolvedValue({
      [StorageKeys.TOOLBAR_PIN_HINT_DISMISSED]: true,
    });
    await render();
    expect(container.textContent).toBe('');

    polyfill.storage.local.get.mockResolvedValue({
      [StorageKeys.TOOLBAR_PIN_HINT_DISMISSED]: false,
    });
    pinState.current = { browser: 'chrome', ready: true, pinned: true };
    await render();
    expect(container.textContent).toBe('');

    pinState.current = { browser: 'unsupported', ready: true, pinned: null };
    await render();
    expect(container.textContent).toBe('');
  });
});
