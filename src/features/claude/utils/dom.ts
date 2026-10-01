/**
 * dom.ts
 * Purpose: Pure utilities for sidebar DOM scanning and parsing (no React or business state).
 * Created: 2026-03-09
 */

import type React from 'react';
import type { Conversation } from '@src/types/conversation';
import {
  CONVERSATION_LINK_SELECTOR,
  CONVERSATION_TITLE_SR_ONLY_SELECTOR,
  CONVERSATION_TITLE_SELECTOR,
  SIDEBAR_CONVERSATION_LIST_SELECTOR,
} from '@src/constants/selectors';

export const findClaudeNav = (): HTMLElement | null => {
  // Option 1: Look for nav or aside that contains a chat link, new button, or search box
  const navCandidates = Array.from(document.querySelectorAll<HTMLElement>('nav, aside, [role="navigation"]'));
  for (const el of navCandidates) {
    if (
      el.querySelector('a[href^="/chat/"]') ||
      el.querySelector('a[href="/new"]') ||
      el.querySelector('button[data-testid="user-menu-button"]') ||
      el.querySelector('input[placeholder*="Search" i]') ||
      el.innerText?.includes('Projects') ||
      el.innerText?.includes('Artifacts') ||
      el.innerText?.includes('專案') ||
      el.innerText?.includes('Recents') ||
      el.innerText?.includes('Today') ||
      el.innerText?.includes('今天')
    ) {
      return el;
    }
  }

  // Option 2: Locate from chat link parent
  const chatLink = document.querySelector('a[href^="/chat/"], a[href="/new"]');
  if (chatLink) {
    const parentNav = chatLink.closest<HTMLElement>('nav, aside, [role="navigation"]');
    if (parentNav) return parentNav;
  }

  // Option 3: Fallback
  return document.querySelector<HTMLElement>('nav') ?? document.querySelector<HTMLElement>('aside') ?? null;
};

export const findNavUl = (): HTMLElement | null => {
  // Option 1: Find ul or list container that contains a chat link (most reliable to identify the chat list)
  const lists = Array.from(
    document.querySelectorAll('nav ul, nav ol, nav [role="list"], aside ul, aside ol, aside [role="list"]')
  );
  for (const list of lists) {
    if (list.querySelector('a[href^="/chat/"]')) {
      return list as HTMLElement;
    }
  }

  // Option 2: Find ul/list next to or inside the container containing "Today", "Recents", etc.
  const divs = Array.from(document.querySelectorAll('nav div, nav section, aside div, aside section'));
  const headerTexts = ['today', '今天', 'recents', '最近', 'yesterday', '昨天'];
  for (const div of divs) {
    const header = div.querySelector('span, h2, h3, div');
    const text = header?.textContent?.trim().toLowerCase();
    if (text && headerTexts.some((h) => text.includes(h))) {
      const list = div.querySelector('ul, ol, [role="list"]');
      if (list) return list as HTMLElement;
    }
  }

  // Option 3: Fallback to the nav element itself
  const nav = findClaudeNav();
  if (nav) return nav;

  const el = document.querySelector(SIDEBAR_CONVERSATION_LIST_SELECTOR);
  if (el instanceof HTMLElement) return el;
  return null;
};

export const extractConversationIdFromHref = (href: string) => {
  if (!href) return null;

  let normalizedHref = href.trim();
  if (!normalizedHref) return null;

  try {
    if (/^https?:\/\//i.test(normalizedHref)) {
      normalizedHref = new URL(normalizedHref).pathname;
    }
  } catch {
    return null;
  }

  if (!normalizedHref.startsWith('/chat/')) return null;
  const raw = normalizedHref.replace('/chat/', '');
  return raw.split(/[?#]/)[0] || null;
};

export const getConversationTitleFromAnchor = (a: HTMLAnchorElement) => {
  const visibleTitle = a.querySelector(CONVERSATION_TITLE_SELECTOR);
  const srOnlyTitle = a.querySelector(CONVERSATION_TITLE_SR_ONLY_SELECTOR);
  return (visibleTitle?.textContent || srOnlyTitle?.textContent || a.textContent || '').trim();
};

export const scanConversations = (root: HTMLElement): Conversation[] => {
  const anchors = Array.from(root.querySelectorAll(CONVERSATION_LINK_SELECTOR));
  const metas: Conversation[] = [];

  for (const a of anchors) {
    if (!(a instanceof HTMLAnchorElement)) continue;
    const href = a.getAttribute('href') || '';
    const id = extractConversationIdFromHref(href);
    if (!id) continue;
    metas.push({ id, href, title: getConversationTitleFromAnchor(a) });
  }

  return metas;
};

export const getConversationIdFromDragEvent = (e: DragEvent | React.DragEvent) => {
  const dt = e.dataTransfer;
  if (!dt) return null;
  const custom = dt.getData('application/x-claude-nexus-conversation');
  if (custom) return extractConversationIdFromHref(`/chat/${custom}`) ?? custom;
  const plain = dt.getData('text/plain');
  if (plain) {
    const fromHref = extractConversationIdFromHref(plain);
    if (fromHref) return fromHref;
    if (plain.length >= 8 && !plain.includes('/')) return plain;
  }
  return null;
};

export const getConversationTitleFromDragEvent = (e: DragEvent | React.DragEvent) => {
  const dt = e.dataTransfer;
  if (!dt) return null;
  const title = dt.getData('application/x-claude-nexus-conversation-title').trim();
  return title || null;
};

const parseRgb = (value: string) => {
  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return null;
  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
};

export const estimateIsDarkBackground = (backgroundColor: string) => {
  const rgb = parseRgb(backgroundColor);
  if (!rgb) return null;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance < 0.55;
};

