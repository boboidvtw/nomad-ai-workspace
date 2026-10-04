import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { setLanguage, current } = vi.hoisted(() => ({
  setLanguage: vi.fn(),
  current: { language: 'en' },
}));

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: current.language, setLanguage, t: (key: string) => key }),
}));

import { LanguageSelect } from '../LanguageSelect';

describe('LanguageSelect', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    current.language = 'en';
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
      root.render(<LanguageSelect />);
    });
  };
  const trigger = () => container.querySelector<HTMLButtonElement>('button[aria-haspopup]')!;

  it('lists every language by its own name and applies the picked one', async () => {
    await render();
    expect(trigger().textContent).toContain('English');
    expect(container.querySelector('[role="listbox"]')).toBeNull();

    await act(async () => trigger().click());
    const options = Array.from(container.querySelectorAll<HTMLElement>('[role="option"]'));
    expect(options).toHaveLength(10);
    expect(options.find((o) => o.getAttribute('aria-selected') === 'true')?.textContent).toContain(
      'English',
    );

    await act(async () => options.find((o) => o.textContent?.includes('日本語'))?.click());
    expect(setLanguage).toHaveBeenCalledWith('ja');
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it('moves with the arrow keys and closes on Escape', async () => {
    await render();
    await act(async () => trigger().click());
    const key = (k: string) =>
      act(async () => {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent('keydown', { key: k, bubbles: true }),
        );
      });

    await key('ArrowDown');
    expect(document.activeElement?.textContent).toContain('简体中文');
    await key('Enter');
    expect(setLanguage).toHaveBeenCalledWith('zh');

    await act(async () => trigger().click());
    await key('Escape');
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});
