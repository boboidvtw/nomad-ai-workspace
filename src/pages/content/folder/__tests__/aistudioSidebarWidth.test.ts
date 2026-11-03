import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import {
  AIStudioSidebarWidth,
  MAX_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_KEY,
} from '../aistudioSidebarWidth';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: { sync: { get: vi.fn(), set: vi.fn() } },
    runtime: { id: 'test-extension-id' },
  },
}));

const syncGet = vi.mocked(browser.storage.sync.get);
const syncSet = vi.mocked(browser.storage.sync.set);

function navContent(expanded = true): HTMLElement {
  const nav = document.createElement('div');
  nav.className = `nav-content v3-left-nav${expanded ? ' expanded' : ''}`;
  document.body.appendChild(nav);
  return nav;
}

beforeEach(() => {
  syncGet.mockReset();
  syncSet.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('AIStudioSidebarWidth', () => {
  it('defaults to 360px', () => {
    expect(new AIStudioSidebarWidth({ isExtensionContextValid: () => true }).width).toBe(360);
  });

  it('loads an in-range width from sync storage', async () => {
    syncGet.mockResolvedValue({ [SIDEBAR_WIDTH_KEY]: 420 });
    const sidebar = new AIStudioSidebarWidth({ isExtensionContextValid: () => true });
    await sidebar.load();
    expect(sidebar.width).toBe(420);
  });

  it('falls back to localStorage when sync holds an out-of-range width', async () => {
    syncGet.mockResolvedValue({ [SIDEBAR_WIDTH_KEY]: MAX_SIDEBAR_WIDTH + 1 });
    localStorage.setItem(SIDEBAR_WIDTH_KEY, '300');
    const sidebar = new AIStudioSidebarWidth({ isExtensionContextValid: () => true });
    await sidebar.load();
    expect(sidebar.width).toBe(300);
  });

  it('skips sync storage when the extension context is gone', async () => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, '250');
    const sidebar = new AIStudioSidebarWidth({ isExtensionContextValid: () => false });
    await sidebar.load();
    expect(syncGet).not.toHaveBeenCalled();
    expect(sidebar.width).toBe(250);
  });

  it('applies the width only while the nav is expanded, unless forced', () => {
    const nav = navContent(false);
    const sidebar = new AIStudioSidebarWidth({ isExtensionContextValid: () => true });

    sidebar.apply();
    expect(nav.style.width).toBe('');
    sidebar.apply(true);
    expect(nav.style.width).toBe('360px');
    expect(nav.style.flex).toBe('0 0 360px');
  });

  it('applies a width changed in another tab, rounded and clamped', () => {
    const nav = navContent();
    const sidebar = new AIStudioSidebarWidth({ isExtensionContextValid: () => true });

    sidebar.applyStoredWidth(301.6);
    expect(sidebar.width).toBe(302);
    expect(nav.style.width).toBe('302px');
    sidebar.applyStoredWidth(10);
    expect(sidebar.width).toBe(MIN_SIDEBAR_WIDTH);
    sidebar.applyStoredWidth('wide');
    expect(sidebar.width).toBe(MIN_SIDEBAR_WIDTH);
  });

  it('clamps drag widths and saves on mouseup', () => {
    const nav = navContent();
    const sidebar = new AIStudioSidebarWidth({ isExtensionContextValid: () => true });
    sidebar.attachResizeHandle();
    const handle = nav.querySelector<HTMLElement>('.gv-sidebar-resize-handle')!;

    handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: -1000 }));
    expect(sidebar.width).toBe(MIN_SIDEBAR_WIDTH);
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 5000 }));
    expect(sidebar.width).toBe(MAX_SIDEBAR_WIDTH);
    document.dispatchEvent(new MouseEvent('mouseup'));

    expect(localStorage.getItem(SIDEBAR_WIDTH_KEY)).toBe(String(MAX_SIDEBAR_WIDTH));
    expect(syncSet).toHaveBeenCalledWith({ [SIDEBAR_WIDTH_KEY]: MAX_SIDEBAR_WIDTH });
  });

  it('returns null without a nav, and a cleanup that detaches the handle otherwise', () => {
    const sidebar = new AIStudioSidebarWidth({ isExtensionContextValid: () => true });
    expect(sidebar.attachResizeHandle()).toBeNull();

    const nav = navContent();
    const cleanup = sidebar.attachResizeHandle();
    expect(nav.querySelector('.gv-sidebar-resize-handle')).not.toBeNull();
    cleanup?.();
    expect(nav.querySelector('.gv-sidebar-resize-handle')).toBeNull();

    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 5000 }));
    expect(sidebar.width).toBe(360);
  });
});
