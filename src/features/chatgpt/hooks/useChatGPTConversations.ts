/**
 * Nomad AI Workspace — useChatGPTConversations Hook
 * Detects ChatGPT sidebar, extracts conversations, handles folder button injection,
 * and maintains portal container for Nomad Folder Manager.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ChatGPTConversation } from '../types';
import {
  extractChatGPTConversationIdFromHref,
  getChatGPTTitleCache,
  saveChatGPTTitleCache,
  type ConversationTitleCache,
} from '../services/storage';

export const CHATGPT_INJECTED_CONTAINER_ID = 'nomad-chatgpt-folder-root';
const CONVERSATION_LINK_SELECTOR = 'a[href*="/c/"]';

interface UseChatGPTConversationsOptions {
  hiddenConversationIds?: Set<string>;
  onConversationContextMenu?: (payload: { x: number; y: number; conversationId: string }) => void;
}

const findChatGPTNav = (): HTMLElement | null => {
  const navs = Array.from(document.querySelectorAll<HTMLElement>('nav'));
  const historyNav = navs.find((n) => {
    const label = (n.getAttribute('aria-label') || '').toLowerCase();
    return label.includes('history') || label.includes('chat') || Boolean(n.querySelector(CONVERSATION_LINK_SELECTOR));
  });
  return historyNav ?? document.querySelector<HTMLElement>('aside nav') ?? navs[0] ?? null;
};

const getTitleFromAnchor = (a: HTMLAnchorElement): string => {
  // Try to find the title container element that avoids SVG and button icons
  const textDiv = a.querySelector<HTMLElement>('div.relative.grow, div.truncate, span.truncate');
  if (textDiv?.textContent?.trim()) {
    return textDiv.textContent.trim();
  }
  return a.innerText?.trim() || a.textContent?.trim() || 'ChatGPT 對話';
};

export const useChatGPTConversations = (options: UseChatGPTConversationsOptions = {}) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [navEl, setNavEl] = useState<HTMLElement | null>(null);
  const [conversationIndex, setConversationIndex] = useState<Record<string, ChatGPTConversation>>({});
  const [conversationTitleIndex, setConversationTitleIndex] = useState<ConversationTitleCache>({});
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(true);
  const [scanTick, setScanTick] = useState(0);

  const onConversationContextMenuRef = useRef(options.onConversationContextMenu);
  onConversationContextMenuRef.current = options.onConversationContextMenu;

  const bumpScanTick = () => setScanTick((t) => (t + 1) % 10000);

  // Load initial title cache
  useEffect(() => {
    void (async () => {
      const cache = await getChatGPTTitleCache();
      setConversationTitleIndex(cache);
    })();
  }, []);

  // Watch URL navigation in ChatGPT SPA
  useEffect(() => {
    const bump = () => bumpScanTick();
    window.addEventListener('popstate', bump);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushStatePatched(...args) {
      const ret = originalPushState.apply(this, args as unknown as Parameters<History['pushState']>);
      bump();
      return ret;
    };

    history.replaceState = function replaceStatePatched(...args) {
      const ret = originalReplaceState.apply(this, args as unknown as Parameters<History['replaceState']>);
      bump();
      return ret;
    };

    return () => {
      window.removeEventListener('popstate', bump);
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
    };
  }, []);

  // Detect Theme (ChatGPT uses html.dark or html[data-theme="dark"])
  useEffect(() => {
    const checkDark = () => {
      const root = document.documentElement;
      const isDark =
        root.classList.contains('dark') ||
        root.getAttribute('data-theme') === 'dark' ||
        window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
      setIsDarkTheme(Boolean(isDark));
    };

    checkDark();
    const mo = new MutationObserver(checkDark);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => mo.disconnect();
  }, []);

  // Ensure injected folder container in ChatGPT sidebar nav
  useEffect(() => {
    const ensureInjected = () => {
      const nav = findChatGPTNav();
      if (nav && navEl !== nav) {
        setNavEl(nav);
        bumpScanTick();
      }

      const existing = document.getElementById(CHATGPT_INJECTED_CONTAINER_ID);
      if (existing) {
        setPortalContainer(existing);
        return;
      }

      if (!nav) return;

      const container = document.createElement('div');
      container.id = CHATGPT_INJECTED_CONTAINER_ID;
      container.className = 'nomad-chatgpt-folder-container px-2 pt-2 pb-1 border-b border-white/5';

      // Insert at the top of chat history (e.g. before the first history list or after the new-chat header)
      const firstSection = nav.querySelector('div.flex-col, ol, div.overflow-y-auto');
      if (firstSection && firstSection.parentElement === nav) {
        nav.insertBefore(container, firstSection);
      } else if (nav.firstChild) {
        nav.insertBefore(container, nav.firstChild);
      } else {
        nav.appendChild(container);
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
      const parent = a.parentElement;
      if (!parent) return;

      if (a.querySelector('.nomad-chatgpt-item-folder-btn')) return;

      const href = a.getAttribute('href') || '';
      const id = extractChatGPTConversationIdFromHref(href);
      if (!id) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className =
        'nomad-chatgpt-item-folder-btn p-1 rounded hover:bg-emerald-500/20 text-zinc-400 hover:text-emerald-400 transition-colors opacity-0 group-hover:opacity-100 hover:opacity-100 flex-shrink-0';
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

      // Append cleanly inside the anchor or item row
      a.appendChild(button);
    };

    const updateConversations = () => {
      const anchors = Array.from(nav.querySelectorAll<HTMLAnchorElement>(CONVERSATION_LINK_SELECTOR));
      const nextIndex: Record<string, ChatGPTConversation> = {};
      const titleUpdates: Record<string, string> = {};

      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        const id = extractChatGPTConversationIdFromHref(href);
        if (!id) continue;

        const title = getTitleFromAnchor(a);
        nextIndex[id] = {
          id,
          title,
          url: `https://chatgpt.com/c/${id}`,
        };
        if (title && title !== 'ChatGPT 對話') {
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
          if (changed) void saveChatGPTTitleCache(next);
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
      const a = target?.closest?.(CONVERSATION_LINK_SELECTOR);
      if (!a || !(a instanceof HTMLAnchorElement)) return;
      const href = a.getAttribute('href') || '';
      const id = extractChatGPTConversationIdFromHref(href);
      if (!id) return;
      const title = getTitleFromAnchor(a);
      e.dataTransfer?.setData('application/x-nomad-chatgpt-conversation', id);
      if (title) e.dataTransfer?.setData('application/x-nomad-chatgpt-conversation-title', title);
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
