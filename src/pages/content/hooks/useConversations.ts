/**
 * useConversations.ts
 * Purpose: Scans claude.ai sidebar conversations, maintains an index, and handles SPA navigation and list rebuilds (no JSX).
 * Created: 2026-03-09
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Conversation } from '@src/types/conversation';
import { estimateIsDarkBackground, extractConversationIdFromHref, findNavUl, scanConversations } from '@pages/content/utils/dom';
import {
  CONVERSATION_LINK_SELECTOR,
  CONVERSATION_LIST_ITEM_SELECTOR,
  SIDEBAR_NAV_SELECTOR,
  SIDEBAR_RECENTS_SECTION_SELECTOR,
} from '@src/constants/selectors';

const INJECTED_CONTAINER_ID = '__claude_nexus_folder_manager__';

const hideConversationListItem = (li: HTMLLIElement) => {
  if (li.dataset.claudeNexusHidden === '1') return;
  li.dataset.claudeNexusHidden = '1';
  li.dataset.claudeNexusPrevDisplay = li.style.display || '';
  li.style.display = 'none';
};

const restoreConversationListItem = (li: HTMLLIElement) => {
  if (li.dataset.claudeNexusHidden !== '1') return;
  li.style.display = li.dataset.claudeNexusPrevDisplay || '';
  delete li.dataset.claudeNexusHidden;
  delete li.dataset.claudeNexusPrevDisplay;
};

const applyConversationVisibility = (ul: HTMLUListElement, hiddenIds: Set<string>) => {
  const anchors = Array.from(ul.querySelectorAll(CONVERSATION_LINK_SELECTOR));
  for (const a of anchors) {
    if (!(a instanceof HTMLAnchorElement)) continue;
    const href = a.getAttribute('href') || '';
    const id = extractConversationIdFromHref(href);
    if (!id) continue;
    const li = a.closest(CONVERSATION_LIST_ITEM_SELECTOR);
    if (!li || !(li instanceof HTMLLIElement)) continue;
    if (hiddenIds.has(id)) hideConversationListItem(li);
    else restoreConversationListItem(li);
  }
};

type UseConversationsOptions = {
  hiddenConversationIds: Set<string>;
  onConversationContextMenu?: (payload: { x: number; y: number; conversationId: string }) => void;
};

export const useConversations = ({ hiddenConversationIds, onConversationContextMenu }: UseConversationsOptions) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [navUlEl, setNavUlEl] = useState<HTMLUListElement | null>(null);

  const lastNavUlRef = useRef<HTMLUListElement | null>(null);
  const hasPatchedHistoryRef = useRef(false);
  const [scanTick, setScanTick] = useState(0);

  const [conversationIndex, setConversationIndex] = useState<Record<string, Conversation>>({});
  const [isDarkTheme, setIsDarkTheme] = useState(true);

  const bumpScanTick = () => setScanTick((x) => x + 1);

  useEffect(() => {
    if (hasPatchedHistoryRef.current) return;
    hasPatchedHistoryRef.current = true;

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

  useEffect(() => {
    const ensureInjected = () => {
      const ul = findNavUl();
      if (ul && lastNavUlRef.current !== ul) {
        lastNavUlRef.current = ul;
        setNavUlEl(ul);
        bumpScanTick();
      }

      const existing = document.getElementById(INJECTED_CONTAINER_ID);
      if (existing) {
        setPortalContainer(existing);
        return;
      }

      const container = document.createElement('div');
      container.id = INJECTED_CONTAINER_ID;
      container.className = 'px-2 pt-2 pb-1';

      const recentsSection = document.querySelector(SIDEBAR_RECENTS_SECTION_SELECTOR);
      if (recentsSection instanceof HTMLElement) {
        recentsSection.insertAdjacentElement('beforebegin', container);
        setPortalContainer(container);
        return;
      }

      if (!ul) return;
      const parent = ul.parentElement;
      if (!parent) return;

      parent.insertBefore(container, ul);
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
  }, []);

  useEffect(() => {
    const el = navUlEl?.closest(SIDEBAR_NAV_SELECTOR) ?? navUlEl?.parentElement ?? null;
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ?? true;
    if (!el) return setIsDarkTheme(prefersDark);
    const bg = window.getComputedStyle(el).backgroundColor;
    const estimated = estimateIsDarkBackground(bg);
    setIsDarkTheme(estimated ?? prefersDark);
  }, [navUlEl, scanTick]);

  useLayoutEffect(() => {
    const ul = navUlEl;
    if (!ul) return;

    const injectFolderButton = (a: HTMLAnchorElement) => {
      const li = a.closest(CONVERSATION_LIST_ITEM_SELECTOR);
      if (!li || !(li instanceof HTMLLIElement)) return;

      if (li.querySelector('.claude-voyager-item-folder-btn')) return;

      const href = a.getAttribute('href') || '';
      const id = extractConversationIdFromHref(href);
      if (!id) return;

      if (window.getComputedStyle(li).position === 'static') {
        li.style.position = 'relative';
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'claude-voyager-item-folder-btn';
      button.setAttribute('aria-label', 'Move to folder / Export');
      button.title = 'Move to folder / Export';

      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"></path>
        </svg>
      `;

      button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const rect = button.getBoundingClientRect();
        onConversationContextMenu?.({
          x: rect.left,
          y: rect.bottom + window.scrollY,
          conversationId: id,
        });
      });

      li.appendChild(button);
    };

    const updateConversations = () => {
      const conversations = scanConversations(ul);
      const nextIndex: Record<string, Conversation> = {};
      for (const c of conversations) nextIndex[c.id] = c;
      setConversationIndex(nextIndex);

      const anchors = Array.from(ul.querySelectorAll(CONVERSATION_LINK_SELECTOR));
      for (const a of anchors) {
        if (!(a instanceof HTMLAnchorElement)) continue;
        if (!a.hasAttribute('draggable')) a.setAttribute('draggable', 'true');
        injectFolderButton(a);
      }

      applyConversationVisibility(ul, hiddenConversationIds);
    };

    updateConversations();
    const mo = new MutationObserver(updateConversations);
    mo.observe(ul, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [navUlEl, scanTick, hiddenConversationIds, onConversationContextMenu]);

  useLayoutEffect(() => {
    const ul = navUlEl;
    if (!ul) return;
    applyConversationVisibility(ul, hiddenConversationIds);
  }, [navUlEl, hiddenConversationIds]);

  useEffect(() => {
    const ul = navUlEl;
    if (!ul) return;

    const handleDragStart = (e: DragEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const a = target?.closest?.(CONVERSATION_LINK_SELECTOR);
      if (!a || !(a instanceof HTMLAnchorElement)) return;
      const href = a.getAttribute('href') || '';
      const id = extractConversationIdFromHref(href);
      if (!id) return;
      e.dataTransfer?.setData('application/x-claude-nexus-conversation', id);
      e.dataTransfer?.setData('text/plain', id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    };

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const a = target?.closest?.(CONVERSATION_LINK_SELECTOR);
      if (!a || !(a instanceof HTMLAnchorElement)) return;
      const href = a.getAttribute('href') || '';
      const id = extractConversationIdFromHref(href);
      if (!id) return;
      e.preventDefault();
      onConversationContextMenu?.({ x: e.clientX, y: e.clientY, conversationId: id });
    };

    ul.addEventListener('dragstart', handleDragStart, true);
    ul.addEventListener('contextmenu', handleContextMenu, true);

    return () => {
      ul.removeEventListener('dragstart', handleDragStart, true);
      ul.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [navUlEl, onConversationContextMenu]);

  const conversations = useMemo(() => Object.values(conversationIndex), [conversationIndex]);

  return {
    portalContainer,
    conversations,
    conversationIndex,
    isDarkTheme,
  };
};

