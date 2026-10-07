/**
 * useSidebarOpen.ts
 * Purpose: Detects Claude sidebar open/collapsed state by observing sidebar navigation width.
 * Created: 2026-03-18
 */

import { useEffect, useState } from 'react';

import { SIDEBAR_WIDTH_TARGET_SELECTOR } from '@src/constants/selectors';

/**
 * Reads current sidebar open state from claude.ai DOM.
 * @returns boolean - true means expanded, false means collapsed
 */
const getSidebarOpen = (): boolean => {
  // Option 1: Check nav element directly if it exists in DOM
  const nav = document.querySelector('nav');
  if (nav instanceof HTMLElement) {
    const width = nav.getBoundingClientRect().width;
    if (width > 60) return true;
    if (width === 0) return false;
  }

  // Option 2: Check for close/collapse buttons (multi-language support)
  const closeButton = document.querySelector(
    'button[aria-label*="Close sidebar" i], button[aria-label*="Hide sidebar" i], button[aria-label*="Collapse sidebar" i], button[aria-label*="關閉" i], button[aria-label*="收合" i]',
  );
  if (closeButton) return true;

  const openButton = document.querySelector(
    'button[aria-label*="Open sidebar" i], button[aria-label*="Show sidebar" i], button[aria-label*="Expand sidebar" i], button[aria-label*="開啟" i], button[aria-label*="展開" i]',
  );
  if (openButton) return false;

  // Option 3: Fallback to target width selector
  const el = document.querySelector(SIDEBAR_WIDTH_TARGET_SELECTOR);
  if (el instanceof HTMLElement) {
    return el.getBoundingClientRect().width > 60;
  }

  return true;
};

/**
 * Watches the claude.ai sidebar width to infer whether it is open.
 * @returns boolean - true means expanded, false means collapsed
 */
export const useSidebarOpen = (): boolean => {
  const [isOpen, setIsOpen] = useState(() => getSidebarOpen());

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    let raf = 0;

    const update = () => {
      if (disposed) return;
      setIsOpen(getSidebarOpen());
    };

    const attach = (target: HTMLElement) => {
      if (ro) return;
      update();

      if (typeof ResizeObserver === 'undefined') return;
      ro = new ResizeObserver(() => {
        if (raf) return;
        raf = window.requestAnimationFrame(() => {
          raf = 0;
          update();
        });
      });
      ro.observe(target);
    };

    const tryAttach = (): boolean => {
      const nav =
        document.querySelector('nav') || document.querySelector(SIDEBAR_WIDTH_TARGET_SELECTOR);
      if (!(nav instanceof HTMLElement)) return false;
      attach(nav);
      return true;
    };

    tryAttach();

    const mo = new MutationObserver(() => {
      if (disposed) return;
      update();
      tryAttach();
    });

    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-expanded', 'data-state'],
    });

    return () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      ro?.disconnect();
      mo.disconnect();
    };
  }, []);

  return isOpen;
};
