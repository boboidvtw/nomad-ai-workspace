/**
 * Nomad AI Workspace — useGrokConversations Hook
 * Detects Grok sidebar, extracts conversations, handles folder button injection,
 * and maintains portal container for Nomad Folder Manager.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  extractGrokConversationIdFromHref,
  getGrokTitleCache,
  saveGrokTitleCache,
  type ConversationTitleCache,
} from '../services/storage';
import type { GrokConversation } from '../types';

export const GROK_INJECTED_CONTAINER_ID = 'nomad-grok-folder-root';
export const GROK_CONVERSATION_LINK_SELECTOR = 'a[href*="/chat/"], a[href*="/c/"]';

interface UseGrokConversationsOptions {
  hiddenConversationIds?: Set<string>;
  onConversationContextMenu?: (payload: { x: number; y: number; conversationId: string }) => void;
}

export const findGrokNav = (): HTMLElement | null => {
  // 1. Explicit sidebar selectors (Shadcn UI data attributes, aside, testid)
  const explicitSidebar = document.querySelector<HTMLElement>(
    '[data-sidebar="sidebar"], [data-sidebar="content"], aside, [data-testid*="sidebar"]',
  );
  if (explicitSidebar) {
    return explicitSidebar;
  }

  // 2. Scan for elements containing conversation links (a[href*=\"/chat/\"], a[href*=\"/c/\"])
  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(GROK_CONVERSATION_LINK_SELECTOR),
  );
  for (const a of anchors) {
    let p: HTMLElement | null = a.parentElement;
    let candidate: HTMLElement | null = null;
    while (p && p !== document.body && p !== document.documentElement) {
      if (
        p.tagName === 'NAV' ||
        p.tagName === 'ASIDE' ||
        p.getAttribute('data-sidebar') === 'sidebar' ||
        p.getAttribute('data-sidebar') === 'content' ||
        p.classList.contains('overflow-y-auto')
      ) {
        candidate = p;
        break;
      }
      if (p.offsetWidth > 0 && p.offsetWidth <= 420) {
        candidate = p;
      }
      p = p.parentElement;
    }
    if (candidate) return candidate;
  }

  // 3. Search for nav or aside with aria-label or containing history/chat/sidebar
  const navs = Array.from(document.querySelectorAll<HTMLElement>('nav, aside, [class*="sidebar"]'));
  const historyNav = navs.find((n) => {
    const label = (n.getAttribute('aria-label') || '').toLowerCase();
    const isSidebarWidth = n.offsetWidth > 0 ? n.offsetWidth <= 450 : true;
    return (
      (label.includes('history') ||
        label.includes('chat') ||
        label.includes('sidebar') ||
        Boolean(n.querySelector(GROK_CONVERSATION_LINK_SELECTOR))) &&
      isSidebarWidth
    );
  });
  if (historyNav) return historyNav;

  // 4. Search by known Grok sidebar section texts ("聊天", "chats", "對話", "專案", "projects", "imagine")
  const keywords = ['聊天', 'chats', '對話', '專案', 'projects', 'imagine'];
  const textElements = Array.from(
    document.querySelectorAll<HTMLElement>('span, p, div, h2, h3, button'),
  );
  for (const el of textElements) {
    const text = el.textContent?.trim().toLowerCase();
    if (text && keywords.includes(text)) {
      let p: HTMLElement | null = el.parentElement;
      while (p && p !== document.body && p !== document.documentElement) {
        if (
          p.tagName === 'ASIDE' ||
          p.tagName === 'NAV' ||
          p.getAttribute('data-sidebar') === 'sidebar' ||
          (p.offsetWidth > 0 && p.offsetWidth <= 400 && p.offsetHeight > 200)
        ) {
          return p;
        }
        p = p.parentElement;
      }
    }
  }

  // 5. Fallback to aside or nav with sidebar width restriction
  const aside = document.querySelector<HTMLElement>('aside');
  if (aside) return aside;

  const genericNav = document.querySelector<HTMLElement>('nav');
  if (genericNav && (genericNav.offsetWidth === 0 || genericNav.offsetWidth <= 450)) {
    return genericNav;
  }

  return null;
};

export const getGrokTitleFromAnchor = (a: HTMLAnchorElement): string => {
  const textDiv = a.querySelector<HTMLElement>(
    'div.truncate, span.truncate, p.truncate, div.grow, span[class*="text"]',
  );
  if (textDiv?.textContent?.trim()) {
    return textDiv.textContent.trim();
  }
  return a.innerText?.trim() || a.textContent?.trim() || 'Grok 對話';
};

export const useGrokConversations = (options: UseGrokConversationsOptions = {}) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [navEl, setNavEl] = useState<HTMLElement | null>(null);
  const [conversationIndex, setConversationIndex] = useState<Record<string, GrokConversation>>({});
  const [conversationTitleIndex, setConversationTitleIndex] = useState<ConversationTitleCache>({});
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(true);
  const [scanTick, setScanTick] = useState(0);

  const onConversationContextMenuRef = useRef(options.onConversationContextMenu);
  useEffect(() => {
    onConversationContextMenuRef.current = options.onConversationContextMenu;
  });

  const bumpScanTick = () => setScanTick((t) => (t + 1) % 10000);

  // Load initial title cache
  useEffect(() => {
    void (async () => {
      const cache = await getGrokTitleCache();
      setConversationTitleIndex(cache);
    })();
  }, []);

  // Watch URL navigation in Grok SPA
  useEffect(() => {
    const bump = () => bumpScanTick();
    window.addEventListener('popstate', bump);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushStatePatched(...args) {
      const ret = originalPushState.apply(
        this,
        args as unknown as Parameters<History['pushState']>,
      );
      bump();
      return ret;
    };

    history.replaceState = function replaceStatePatched(...args) {
      const ret = originalReplaceState.apply(
        this,
        args as unknown as Parameters<History['replaceState']>,
      );
      bump();
      return ret;
    };

    return () => {
      window.removeEventListener('popstate', bump);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  // Detect Theme (Grok is predominantly dark mode, but support dark/light attribute toggling)
  useEffect(() => {
    const checkDark = () => {
      const root = document.documentElement;
      const isDark =
        root.classList.contains('dark') ||
        root.getAttribute('data-theme') === 'dark' ||
        document.body.classList.contains('dark') ||
        (window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true);
      setIsDarkTheme(Boolean(isDark));
    };

    checkDark();
    const mo = new MutationObserver(checkDark);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => mo.disconnect();
  }, []);

  // Ensure injected folder container in Grok sidebar nav
  useEffect(() => {
    const ensureInjected = () => {
      const nav = findGrokNav();
      if (nav && navEl !== nav) {
        setNavEl(nav);
        bumpScanTick();
      }

      const existing = document.getElementById(GROK_INJECTED_CONTAINER_ID);
      if (existing) {
        if (nav && !nav.contains(existing)) {
          existing.remove();
        } else {
          setPortalContainer(existing);
          return;
        }
      }

      if (!nav) return;

      const container = document.createElement('div');
      container.id = GROK_INJECTED_CONTAINER_ID;
      container.className = 'nomad-grok-folder-container px-2 pt-2 pb-1 border-b border-white/5';

      // Find optimal insertion anchor inside sidebar:
      // Priority 1: Right before the "聊天" / "Chats" / "History" heading or group
      const chatKeywords = ['聊天', 'chats', 'history', '最近', 'recents'];
      let targetSection: HTMLElement | null = null;
      const allTextNodes = Array.from(
        nav.querySelectorAll<HTMLElement>('h2, h3, h4, span, div, p, button'),
      );
      for (const el of allTextNodes) {
        const text = el.textContent?.trim().toLowerCase();
        if (text && chatKeywords.some((k) => text === k || text.startsWith(k))) {
          // Walk up to find the group container inside nav
          let cur: HTMLElement | null = el.parentElement;
          while (cur && cur !== nav) {
            if (
              cur.getAttribute('data-sidebar') === 'group' ||
              cur.getAttribute('data-sidebar') === 'content' ||
              cur.classList.contains('overflow-y-auto') ||
              cur.classList.contains('flex-col')
            ) {
              targetSection = cur;
              break;
            }
            cur = cur.parentElement;
          }
          if (targetSection) break;
          targetSection = el;
          break;
        }
      }

      // Priority 2: Before the first conversation link in sidebar
      if (!targetSection) {
        const firstLink = nav.querySelector<HTMLAnchorElement>(GROK_CONVERSATION_LINK_SELECTOR);
        if (firstLink) {
          let cur: HTMLElement | null = firstLink.parentElement;
          while (cur && cur !== nav) {
            if (
              cur.classList.contains('overflow-y-auto') ||
              cur.getAttribute('data-sidebar') === 'group'
            ) {
              targetSection = cur;
              break;
            }
            cur = cur.parentElement;
          }
          if (!targetSection) targetSection = firstLink;
        }
      }

      // Insert container into DOM
      if (targetSection && targetSection.parentElement) {
        targetSection.parentElement.insertBefore(container, targetSection);
      } else {
        const scrollable = nav.querySelector<HTMLElement>(
          '[data-sidebar="content"], div.overflow-y-auto',
        );
        if (scrollable) {
          scrollable.insertBefore(container, scrollable.firstChild);
        } else if (nav.firstChild) {
          nav.insertBefore(container, nav.firstChild);
        } else {
          nav.appendChild(container);
        }
      }

      setPortalContainer(container);
    };

    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        ensureInjected();
      });
    };

    schedule();

    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      mo.disconnect();
    };
  }, [navEl]);

  // Scan conversations & inject folder action buttons into sidebar anchors
  useLayoutEffect(() => {
    const nav = navEl ?? document.body;

    const injectFolderButton = (a: HTMLAnchorElement) => {
      if (a.querySelector('.nomad-grok-item-folder-btn')) return;

      const href = a.getAttribute('href') || '';
      const id = extractGrokConversationIdFromHref(href);
      if (!id) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        'nomad-grok-item-folder-btn p-1 rounded hover:bg-sky-500/20 text-zinc-400 hover:text-sky-400 transition-colors opacity-0 group-hover:opacity-100 hover:opacity-100 flex-shrink-0';
      button.setAttribute('aria-label', '移動至 Nomad 資料夾');
      button.title = '移動至 Nomad 資料夾';

      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"></path>
        </svg>
      `;

      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const rect = button.getBoundingClientRect();
        onConversationContextMenuRef.current?.({
          x: rect.left,
          y: rect.bottom + window.scrollY,
          conversationId: id,
        });
      });

      a.appendChild(button);
    };

    const updateConversations = () => {
      const anchors = Array.from(
        nav.querySelectorAll<HTMLAnchorElement>(GROK_CONVERSATION_LINK_SELECTOR),
      );
      const nextIndex: Record<string, GrokConversation> = {};
      const titleUpdates: Record<string, string> = {};

      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const id = extractGrokConversationIdFromHref(href);
        if (!id) continue;

        const title = getGrokTitleFromAnchor(a);
        nextIndex[id] = {
          id,
          title,
          url: `https://grok.com/chat/${id}`,
        };
        if (title && title !== 'Grok 對話') {
          titleUpdates[id] = title;
        }

        if (!a.hasAttribute('draggable')) a.setAttribute('draggable', 'true');
        injectFolderButton(a);
      }

      setConversationIndex((prev) => ({ ...prev, ...nextIndex }));

      if (Object.keys(titleUpdates).length > 0) {
        setConversationTitleIndex((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [id, title] of Object.entries(titleUpdates)) {
            if (next[id] === title) continue;
            next[id] = title;
            changed = true;
          }
          if (changed) void saveGrokTitleCache(next);
          return changed ? next : prev;
        });
      }
    };

    updateConversations();
    const mo = new MutationObserver(updateConversations);
    mo.observe(nav, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [navEl, scanTick]);

  // Drag and drop event listeners
  useEffect(() => {
    const nav = navEl ?? document.body;

    const handleDragStart = (e: DragEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const a = target?.closest?.(GROK_CONVERSATION_LINK_SELECTOR);
      if (!a || !(a instanceof HTMLAnchorElement)) return;
      const href = a.getAttribute('href') || '';
      const id = extractGrokConversationIdFromHref(href);
      if (!id) return;
      const title = getGrokTitleFromAnchor(a);
      e.dataTransfer?.setData('application/x-nomad-grok-conversation', id);
      if (title) e.dataTransfer?.setData('application/x-nomad-grok-conversation-title', title);
      e.dataTransfer?.setData('text/plain', id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    };

    nav.addEventListener('dragstart', handleDragStart, true);
    return () => nav.removeEventListener('dragstart', handleDragStart, true);
  }, [navEl]);

  const conversations = useMemo(() => Object.values(conversationIndex), [conversationIndex]);

  return {
    portalContainer,
    conversations,
    conversationIndex,
    conversationTitleIndex,
    isDarkTheme,
  };
};
