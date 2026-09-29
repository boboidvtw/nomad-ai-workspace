import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { polyfill, pinState, openGemini } = vi.hoisted(() => ({
  polyfill: { storage: { sync: { get: vi.fn() } } },
  pinState: {
    current: { browser: 'chrome', ready: true, pinned: false } as {
      browser: string;
      ready: boolean;
      pinned: boolean | null;
    },
  },
  openGemini: vi.fn(),
}));

vi.mock('webextension-polyfill', () => ({ default: polyfill }));
vi.mock('@/features/onboarding/useToolbarPinState', () => ({
  useToolbarPinState: () => pinState.current,
}));
vi.mock('@/features/onboarding/openGemini', () => ({
  focusOrOpenGemini: openGemini,
  GEMINI_APP_URL: 'https://gemini.google.com/app',
}));
vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn(), t: (key: string) => key }),
}));

import { Welcome } from '../Welcome';

describe('Welcome', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    polyfill.storage.sync.get.mockResolvedValue({});
    openGemini.mockResolvedValue(undefined);
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
      root.render(<Welcome />);
    });
  };

  it('walks through the pin step first and reports the live pin state', async () => {
    pinState.current = { browser: 'chrome', ready: true, pinned: false };
    await render();
    const steps = container.querySelectorAll('li[aria-current], ol > li');
    expect(steps.length).toBe(2);
    expect(container.querySelector('li[aria-current="step"]')?.textContent).toContain(
      'welcomeStepPinTitle',
    );
    expect(container.textContent).toContain('welcomePinStepsChrome');
    expect(container.querySelector('[role="status"]')?.textContent).toContain('welcomePinWaiting');

    pinState.current = { browser: 'chrome', ready: true, pinned: true };
    await render();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('welcomePinDone');
    expect(container.querySelector('li[aria-current="step"]')?.textContent).toContain(
      'welcomeStepOpenTitle',
    );
  });

  it('skips the pin step where the toolbar has no pin', async () => {
    pinState.current = { browser: 'unsupported', ready: true, pinned: null };
    await render();
    expect(container.querySelectorAll('ol > li').length).toBe(1);
    expect(container.textContent).not.toContain('welcomeStepPinTitle');
  });

  it('opens Gemini from the primary button', async () => {
    pinState.current = { browser: 'edge', ready: true, pinned: false };
    await render();
    expect(container.textContent).toContain('welcomePinStepsEdge');
    const button = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('welcomeOpenGemini'),
    );
    await act(async () => {
      button?.click();
    });
    expect(openGemini).toHaveBeenCalledTimes(1);
  });
});
