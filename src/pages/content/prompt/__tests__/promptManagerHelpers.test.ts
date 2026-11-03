import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  collectAllTags,
  computeAnchoredPosition,
  createEl,
  dedupeTags,
  detectPageTheme,
  elFromHTML,
  escapeHtml,
  isPMPanelView,
  uid,
} from '../promptManagerHelpers';

vi.mock('webextension-polyfill', () => ({ default: globalThis.chrome }));

describe('tags', () => {
  it('dedupes case-insensitively, trims, drops blanks and keeps first-seen order', () => {
    expect(dedupeTags([' Work', 'work', '', '  ', 'AI', 'ai '])).toEqual(['work', 'ai']);
  });

  it('collects every tag in lower case, sorted, once', () => {
    const items = [
      { id: '1', text: 'a', tags: ['Zeta', 'alpha'], createdAt: 1 },
      { id: '2', text: 'b', tags: ['ALPHA'], createdAt: 2 },
      { id: '3', text: 'c', tags: [], createdAt: 3 },
    ];
    expect(collectAllTags(items)).toEqual(['alpha', 'zeta']);
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });
});

describe('uid', () => {
  it('gives short base-36 ids that differ between calls', () => {
    const a = uid();
    const b = uid();
    expect(a).toMatch(/^[0-9a-z]{1,7}$/);
    expect(a).not.toBe(b);
  });
});

describe('DOM helpers', () => {
  it('creates an element with an optional class', () => {
    expect(createEl('button', 'gv-pm-btn').outerHTML).toBe('<button class="gv-pm-btn"></button>');
    expect(createEl('div').className).toBe('');
  });

  it('builds the first element of an HTML snippet', () => {
    const el = elFromHTML('  <span class="x">hi</span><b>ignored</b> ');
    expect(el.tagName).toBe('SPAN');
    expect(el.textContent).toBe('hi');
  });
});

describe('isPMPanelView', () => {
  it('accepts only the two panel views', () => {
    expect(isPMPanelView('prompts')).toBe(true);
    expect(isPMPanelView('starred')).toBe(true);
    expect(isPMPanelView('other')).toBe(false);
    expect(isPMPanelView(null)).toBe(false);
  });
});

describe('detectPageTheme', () => {
  afterEach(() => {
    document.body.className = '';
    document.documentElement.className = '';
    document.body.removeAttribute('data-theme');
  });

  it('reads the theme the page sets before the system preference', () => {
    document.body.classList.add('dark-theme');
    expect(detectPageTheme()).toBe('dark');

    document.body.className = '';
    document.body.setAttribute('data-theme', 'light');
    expect(detectPageTheme()).toBe('light');
  });

  it('falls back to the system preference', () => {
    const matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
    vi.stubGlobal('matchMedia', matchMedia);
    expect(detectPageTheme()).toBe('dark');
    vi.unstubAllGlobals();
  });
});

describe('computeAnchoredPosition', () => {
  const box = (rect: Partial<DOMRect>): HTMLElement => {
    const el = document.createElement('div');
    el.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, left: 0, ...rect }) as DOMRect;
    return el;
  };

  it('opens the panel above the trigger, right-aligned to it', () => {
    vi.stubGlobal('innerWidth', 1200);
    const trigger = box({ top: 700, left: 1100, width: 40 });
    const panel = box({ width: 340, height: 400 });

    // left = 1100 + 40 - 340, top = 700 - 400 - 10
    expect(computeAnchoredPosition(trigger, panel)).toEqual({ top: 290, left: 800 });
    vi.unstubAllGlobals();
  });

  it('keeps the panel inside the viewport', () => {
    vi.stubGlobal('innerWidth', 500);
    const trigger = box({ top: 50, left: 10, width: 40 });
    const panel = box({ width: 0, height: 0 });

    // width falls back to 320 and height to 360; both edges clamp to the 8px pad
    expect(computeAnchoredPosition(trigger, panel)).toEqual({ top: 8, left: 8 });
    vi.unstubAllGlobals();
  });
});
