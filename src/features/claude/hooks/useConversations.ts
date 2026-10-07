/**
 * useConversations.ts
 * Purpose: Scans claude.ai sidebar conversations, maintains an index, and handles SPA navigation and list rebuilds (no JSX).
 * Created: 2026-03-09
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  CONVERSATION_LINK_SELECTOR,
  CONVERSATION_LIST_ITEM_SELECTOR,
  SIDEBAR_NAV_SELECTOR,
} from '@src/constants/selectors';
import type { Conversation } from '@src/types/conversation';

import {
  CONVERSATION_TITLE_CACHE_KEY,
  getConversationTitleCache,
  saveConversationTitleCache,
} from '@/features/claude/services/storage';
import {
  estimateIsDarkBackground,
  extractConversationIdFromHref,
  findClaudeNav,
  findNavUl,
  getConversationTitleFromAnchor,
  scanConversations,
} from '@/features/claude/utils/dom';

const INJECTED_CONTAINER_ID = '__claude_nexus_folder_manager__';

const hideConversationListItem = (li: HTMLElement) => {
  if (li.dataset.claudeNexusHidden === '1') return;
  li.dataset.claudeNexusHidden = '1';
  li.dataset.claudeNexusPrevDisplay = li.style.display || '';
  li.style.display = 'none';
};

const restoreConversationListItem = (li: HTMLElement) => {
  if (li.dataset.claudeNexusHidden !== '1') return;
  li.style.display = li.dataset.claudeNexusPrevDisplay || '';
  delete li.dataset.claudeNexusHidden;
  delete li.dataset.claudeNexusPrevDisplay;
};

const applyConversationVisibility = (root: HTMLElement, hiddenIds: Set<string>) => {
  const anchors = Array.from(root.querySelectorAll(CONVERSATION_LINK_SELECTOR));
  for (const a of anchors) {
    if (!(a instanceof HTMLAnchorElement)) continue;
    const href = a.getAttribute('href') || '';
    const id = extractConversationIdFromHref(href);
    if (!id) continue;
    const li = (a.closest('li, [role="listitem"]') || a.parentElement) as HTMLElement | null;
    if (!li || !(li instanceof HTMLElement)) continue;
    if (hiddenIds.has(id)) hideConversationListItem(li);
    else restoreConversationListItem(li);
  }
};

type UseConversationsOptions = {
  hiddenConversationIds: Set<string>;
  onConversationContextMenu?: (payload: { x: number; y: number; conversationId: string }) => void;
};

export const useConversations = ({
  hiddenConversationIds,
  onConversationContextMenu,
}: UseConversationsOptions) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [navUlEl, setNavUlEl] = useState<HTMLElement | null>(null);

  const onConversationContextMenuRef = useRef(onConversationContextMenu);
  useEffect(() => {
    onConversationContextMenuRef.current = onConversationContextMenu;
  }, [onConversationContextMenu]);

  const lastNavUlRef = useRef<HTMLElement | null>(null);
  const hasPatchedHistoryRef = useRef(false);
  const [scanTick, setScanTick] = useState(0);

  const [conversationIndex, setConversationIndex] = useState<Record<string, Conversation>>({});
  const [conversationTitleIndex, setConversationTitleIndex] = useState<Record<string, string>>({});
  const [isDarkTheme, setIsDarkTheme] = useState(true);

  const bumpScanTick = () => setScanTick((x) => x + 1);

  useEffect(() => {
    void (async () => {
      const loaded = await getConversationTitleCache();
      setConversationTitleIndex(loaded);
    })();

    const handleChanged: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area !== 'local') return;
      if (!changes?.[CONVERSATION_TITLE_CACHE_KEY]) return;
      void (async () => {
        const next = await getConversationTitleCache();
        setConversationTitleIndex(next);
      })();
    };

    chrome?.storage?.onChanged?.addListener(handleChanged);
    return () => chrome?.storage?.onChanged?.removeListener(handleChanged);
  }, []);

  useEffect(() => {
    if (hasPatchedHistoryRef.current) return;
    hasPatchedHistoryRef.current = true;

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

  useEffect(() => {
    const ensureInjected = () => {
      const nav = findClaudeNav() ?? document.querySelector('nav');
      if (!nav) return;

      const ul = findNavUl() || nav;
      if (lastNavUlRef.current !== ul) {
        lastNavUlRef.current = ul;
        setNavUlEl(ul);
        bumpScanTick();
      }

      const existing = document.getElementById(INJECTED_CONTAINER_ID);
      if (existing) {
        if (!nav.contains(existing)) {
          existing.remove();
        } else {
          setPortalContainer(existing);
          return;
        }
      }

      const container = document.createElement('div');
      container.id = INJECTED_CONTAINER_ID;
      container.className = 'nomad-claude-folder-container px-2 pt-2 pb-1 w-full';

      // 1. Locate date/history heading section inside nav (Today / Recents / Yesterday / Previous days)
      let recentsSection: HTMLElement | null = null;
      const historyKeywords = [
        'today',
        '今天',
        'recents',
        '最近',
        '最近對話',
        '最近的對話',
        'yesterday',
        '昨天',
        'previous 7 days',
        '過去 7 天',
        '前 7 天',
        'previous 30 days',
        '過去 30 天',
        '前 30 天',
      ];

      const allTextCandidates = Array.from(
        nav.querySelectorAll('h2, h3, h4, span, div, p, button'),
      );
      for (const el of allTextCandidates) {
        const text = el.textContent?.trim().toLowerCase();
        if (text && historyKeywords.some((k) => text === k || text.startsWith(k))) {
          let p: HTMLElement | null = el as HTMLElement;
          while (p && p.parentElement && p.parentElement !== nav) {
            const parentEl: HTMLElement = p.parentElement;
            if (
              parentEl.classList.contains('overflow-y-auto') ||
              parentEl.classList.contains('overflow-x-clip') ||
              parentEl.classList.contains('flex-1') ||
              parentEl.tagName === 'NAV' ||
              parentEl.tagName === 'ASIDE'
            ) {
              recentsSection = p;
              break;
            }
            p = parentEl;
          }
          if (recentsSection) break;
          recentsSection = el as HTMLElement;
          break;
        }
      }

      if (recentsSection && recentsSection.parentElement && nav.contains(recentsSection)) {
        recentsSection.parentElement.insertBefore(container, recentsSection);
        setPortalContainer(container);
        return;
      }

      // 2. Locate first conversation link (a[href^="/chat/"]) and insert before its list container
      const firstChatLink = nav.querySelector('a[href^="/chat/"]');
      if (firstChatLink) {
        let p: HTMLElement | null = firstChatLink as HTMLElement;
        while (p && p.parentElement && p.parentElement !== nav) {
          const parentEl: HTMLElement = p.parentElement;
          if (
            parentEl.classList.contains('overflow-y-auto') ||
            parentEl.classList.contains('overflow-x-clip') ||
            parentEl.classList.contains('flex-1') ||
            parentEl.tagName === 'NAV' ||
            parentEl.tagName === 'ASIDE'
          ) {
            break;
          }
          p = parentEl;
        }
        if (p && p.parentElement && nav.contains(p)) {
          p.parentElement.insertBefore(container, p);
          setPortalContainer(container);
          return;
        }
      }

      // 3. Locate the menu group (containing Projects / Artifacts / More) and insert after it
      const menuAnchor = Array.from(nav.querySelectorAll('a, button, span, div')).find((el) => {
        const t = el.textContent?.trim().toLowerCase();
        return t === 'projects' || t === 'artifacts' || t === '專案' || t === '成品';
      });
      if (menuAnchor) {
        let p: HTMLElement | null = menuAnchor as HTMLElement;
        while (p && p.parentElement && p.parentElement !== nav) {
          const parentEl: HTMLElement = p.parentElement;
          if (
            parentEl.classList.contains('overflow-y-auto') ||
            parentEl.classList.contains('overflow-x-clip') ||
            parentEl.classList.contains('flex-1') ||
            parentEl.tagName === 'NAV' ||
            parentEl.tagName === 'ASIDE'
          ) {
            break;
          }
          p = parentEl;
        }
        if (p && p.parentElement && nav.contains(p)) {
          if (p.nextSibling) {
            p.parentElement.insertBefore(container, p.nextSibling);
          } else {
            p.parentElement.appendChild(container);
          }
          setPortalContainer(container);
          return;
        }
      }

      // 4. Prepend to main scrollable section of nav
      const scrollable = nav.querySelector('div.overflow-y-auto, div.overflow-x-clip, div.flex-1');
      if (scrollable && scrollable instanceof HTMLElement && nav.contains(scrollable)) {
        scrollable.prepend(container);
        setPortalContainer(container);
        return;
      }

      // 5. Fallback: Before valid UL inside nav
      if (ul && ul !== nav && ul.parentElement && nav.contains(ul)) {
        ul.parentElement.insertBefore(container, ul);
        setPortalContainer(container);
        return;
      }

      // 6. Fallback: Before bottom user menu or profile row
      const bottomProfile = nav.querySelector(
        'button[data-testid="user-menu-button"], div.mt-auto',
      );
      if (bottomProfile && bottomProfile.parentElement && nav.contains(bottomProfile)) {
        bottomProfile.parentElement.insertBefore(container, bottomProfile);
        setPortalContainer(container);
        return;
      }

      // 7. Fallback: Prepend or append inside nav
      if (nav.children.length > 2) {
        nav.insertBefore(container, nav.children[2]);
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
      const li = a.closest(CONVERSATION_LIST_ITEM_SELECTOR) || a.parentElement;
      if (!li || !(li instanceof HTMLElement)) return;

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
        onConversationContextMenuRef.current?.({
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

      const titleUpdates: Record<string, string> = {};
      for (const c of conversations) {
        const title = c.title.trim();
        if (title) titleUpdates[c.id] = title;
      }
      if (Object.keys(titleUpdates).length > 0) {
        setConversationTitleIndex((prev) => {
          let changed = false;
          const next = { ...prev };

          for (const [id, title] of Object.entries(titleUpdates)) {
            if (next[id] === title) continue;
            next[id] = title;
            changed = true;
          }

          if (changed) void saveConversationTitleCache(next);
          return changed ? next : prev;
        });
      }

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
  }, [navUlEl, scanTick, hiddenConversationIds]);

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
      const title = getConversationTitleFromAnchor(a).trim();
      e.dataTransfer?.setData('application/x-claude-nexus-conversation', id);
      if (title) e.dataTransfer?.setData('application/x-claude-nexus-conversation-title', title);
      e.dataTransfer?.setData('text/plain', id);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';

      if (title) {
        setConversationTitleIndex((prev) => {
          if (prev[id] === title) return prev;
          const next = { ...prev, [id]: title };
          void saveConversationTitleCache(next);
          return next;
        });
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      const a = target?.closest?.(CONVERSATION_LINK_SELECTOR);
      if (!a || !(a instanceof HTMLAnchorElement)) return;
      const href = a.getAttribute('href') || '';
      const id = extractConversationIdFromHref(href);
      if (!id) return;
      e.preventDefault();
      onConversationContextMenuRef.current?.({ x: e.clientX, y: e.clientY, conversationId: id });
    };

    ul.addEventListener('dragstart', handleDragStart, true);
    ul.addEventListener('contextmenu', handleContextMenu, true);

    return () => {
      ul.removeEventListener('dragstart', handleDragStart, true);
      ul.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [navUlEl]);

  const conversations = useMemo(() => Object.values(conversationIndex), [conversationIndex]);

  return {
    portalContainer,
    conversations,
    conversationIndex,
    conversationTitleIndex,
    isDarkTheme,
  };
};
