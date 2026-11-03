/**
 * Makes AI Studio's native prompt links draggable into folders: the legacy history
 * list, the V2 nav's body-level history popovers and the /library table. Also keeps
 * stored conversation titles in step with the native titles shown in the history list.
 */
import {
  BODY_PROMPT_POPOVER_SELECTOR,
  buildLibraryPromptData,
  extractPromptId,
  extractPromptIdFromHref,
  extractPromptTitle,
  getLibraryPromptAnchor,
  getLibraryPromptRows,
  mutationAddsPromptLinks,
  mutationMayAffectPromptTitles,
  nodeContainsPromptLink,
  PROMPT_DRAG_HOST_SELECTORS,
  PROMPT_LINK_SELECTOR,
  setPromptDragData,
  UNBOUND_PROMPT_LINK_SELECTOR,
} from './aistudioPromptLinks';
import { now } from './aistudioUtils';
import type { DragData, FolderData } from './types';

const PROMPT_LIST_BIND_DEBOUNCE_MS = 120;
const PROMPT_TITLE_SYNC_DEBOUNCE_MS = 280;
const LIBRARY_TABLE_NODE_SELECTOR =
  'table.mat-mdc-table, mat-table, tr.mat-mdc-row, tr[mat-row], tr[role="row"]';

export interface PromptListBindingOptions {
  /** The legacy `ms-prompt-history-v3` list; null on the V2 nav. */
  getHistoryRoot: () => HTMLElement | null;
  getData: () => FolderData;
  setData: (data: FolderData) => void;
  canEdit: () => boolean;
  save: () => Promise<boolean>;
  render: () => void;
  highlightActiveConversation: () => void;
  /** Called once per newly bound /library row (multi-select long-press). */
  bindLibraryRow: (row: HTMLElement) => void;
  /** Called after every /library binding pass (hide-archived, multi-select UI). */
  afterLibraryRowsBound: () => void;
}

/**
 * Collect every native prompt-link title in a single document scan and return a
 * promptId -> title map. Anchors carrying the `prompt-link` class win over generic
 * matches (mirroring the old per-conversation selector priority); within each tier
 * the first anchor in document order with a usable title wins.
 */
export function collectNativePromptTitles(): Map<string, string> {
  const preferred = new Map<string, string>();
  const fallback = new Map<string, string>();
  const anchors = document.querySelectorAll<HTMLAnchorElement>(PROMPT_LINK_SELECTOR);
  anchors.forEach((anchor) => {
    const promptId = extractPromptIdFromHref(anchor.getAttribute('href') || anchor.href || '');
    if (!promptId) return;
    const title = extractPromptTitle(anchor);
    if (!title) return;
    if (anchor.classList.contains('prompt-link')) {
      if (!preferred.has(promptId)) preferred.set(promptId, title);
    } else if (!fallback.has(promptId)) {
      fallback.set(promptId, title);
    }
  });
  const titles = fallback;
  preferred.forEach((title, promptId) => titles.set(promptId, title));
  return titles;
}

/**
 * Copy native titles onto stored conversations that were not renamed by hand.
 * @returns the updated data, or null when no title changed
 */
export function applyNativeTitles(
  data: FolderData,
  nativeTitles: Map<string, string>,
  timestamp: number,
): FolderData | null {
  let hasUpdates = false;
  const folderContents = Object.fromEntries(
    Object.entries(data.folderContents).map(([folderId, conversations]) => [
      folderId,
      conversations.map((conversation) => {
        if (conversation.customTitle) return conversation;
        const nativeTitle = nativeTitles.get(conversation.conversationId);
        if (!nativeTitle || nativeTitle === conversation.title) return conversation;
        hasUpdates = true;
        return { ...conversation, title: nativeTitle, updatedAt: timestamp };
      }),
    ]),
  );
  return hasUpdates ? { ...data, folderContents } : null;
}

export function libraryTableMutated(mutations: MutationRecord[]): boolean {
  for (const mutation of mutations) {
    if (
      mutation.target instanceof Element &&
      mutation.target.closest('table.mat-mdc-table, mat-table')
    ) {
      return true;
    }

    for (const node of Array.from(mutation.addedNodes)) {
      if (!(node instanceof Element)) continue;
      if (
        node.matches(LIBRARY_TABLE_NODE_SELECTOR) ||
        !!node.querySelector(LIBRARY_TABLE_NODE_SELECTOR)
      ) {
        return true;
      }
    }
  }
  return false;
}

function hasStoredConversations(data: FolderData): boolean {
  return Object.values(data.folderContents).some((conversations) => conversations.length > 0);
}

function resolvePromptAnchorFromHost(hostEl: HTMLElement): HTMLAnchorElement | null {
  if (hostEl.matches(PROMPT_LINK_SELECTOR)) {
    return hostEl as HTMLAnchorElement;
  }
  return hostEl.querySelector(PROMPT_LINK_SELECTOR) as HTMLAnchorElement | null;
}

function resolvePromptAnchorFromDragEvent(
  event: DragEvent,
  hostEl: HTMLElement,
): HTMLAnchorElement | null {
  const target = event.target;
  if (target instanceof Element) {
    const targetAnchor = target.closest(PROMPT_LINK_SELECTOR) as HTMLAnchorElement | null;
    if (targetAnchor) return targetAnchor;
  }
  return resolvePromptAnchorFromHost(hostEl);
}

function resolvePromptDragHost(anchor: HTMLAnchorElement): HTMLElement {
  for (const selector of PROMPT_DRAG_HOST_SELECTORS) {
    const match = anchor.closest(selector) as HTMLElement | null;
    if (match) return match;
  }
  return anchor.parentElement || anchor;
}

function isBodyPromptPopoverElement(element: Element): boolean {
  return (
    element.matches(BODY_PROMPT_POPOVER_SELECTOR) || !!element.closest(BODY_PROMPT_POPOVER_SELECTOR)
  );
}

export class AIStudioPromptListBinding {
  private promptListBindTimer: number | null = null;
  private promptTitleSyncTimer: number | null = null;
  private promptTitleSyncInProgress = false;
  private libraryObserver: MutationObserver | null = null;
  private bodyPopoverObserver: MutationObserver | null = null;

  constructor(private readonly options: PromptListBindingOptions) {}

  get libraryTableObserver(): MutationObserver | null {
    return this.libraryObserver;
  }

  get bodyPromptPopoverObserver(): MutationObserver | null {
    return this.bodyPopoverObserver;
  }

  /**
   * Watch the legacy history list for new links and renamed titles.
   * @returns cleanup for the observer, click listener and debounce timers; null without a list
   */
  observePromptList(): (() => void) | null {
    const root = this.options.getHistoryRoot();
    if (!root) return null;
    const observer = new MutationObserver((mutations) => {
      if (mutationAddsPromptLinks(mutations)) {
        this.schedulePromptListBinding();
      }
      if (mutationMayAffectPromptTitles(mutations)) {
        this.schedulePromptTitleSync();
      }
    });
    try {
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['title', 'aria-label', 'href'],
      });
    } catch {}

    // Also update on clicks within the prompt list (SPA navigation)
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const a = target.closest('a.prompt-link') as HTMLAnchorElement | null;
      if (a && /\/prompts\//.test(a.getAttribute('href') || '')) {
        setTimeout(() => this.options.highlightActiveConversation(), 0);
      }
    };
    try {
      root.addEventListener('click', onClick, true);
    } catch {}

    return () => {
      try {
        observer.disconnect();
      } catch {}
      this.clearTimers();
      try {
        root.removeEventListener('click', onClick, true);
      } catch {}
    };
  }

  /**
   * V2 nav renders History recents in a body-level hover popover rather than inline
   * rows. Bind those transient links as they appear. Idempotent.
   */
  observeBodyPromptPopovers(): void {
    if (this.bodyPopoverObserver) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;
          // Cheap overlay-container gate first (class match + ancestor walk) before
          // the expensive subtree scan for prompt links.
          if (!isBodyPromptPopoverElement(node)) continue;
          if (!nodeContainsPromptLink(node)) continue;
          this.bindDraggablesInPromptList(node);
        }
      }
    });

    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch {}
    this.bodyPopoverObserver = observer;

    document
      .querySelectorAll(BODY_PROMPT_POPOVER_SELECTOR)
      .forEach((root) => this.bindDraggablesInPromptList(root));
  }

  bindDraggablesInPromptList(scope?: ParentNode | null): void {
    const root = scope ?? this.options.getHistoryRoot();
    if (!root) return;
    const anchors: HTMLAnchorElement[] = [];
    if (root instanceof Element && root.matches(UNBOUND_PROMPT_LINK_SELECTOR)) {
      anchors.push(root as HTMLAnchorElement);
    }
    root.querySelectorAll(UNBOUND_PROMPT_LINK_SELECTOR).forEach((anchor) => {
      anchors.push(anchor as HTMLAnchorElement);
    });
    anchors.forEach((anchor) => {
      const hostEl = resolvePromptDragHost(anchor);
      anchor.dataset.gvDragBound = '1';
      if ((hostEl as Element & { _gvDragBound?: boolean })._gvDragBound) return;
      (hostEl as Element & { _gvDragBound?: boolean })._gvDragBound = true;
      hostEl.draggable = true;
      if (!hostEl.style.cursor) {
        hostEl.style.cursor = 'grab';
      }
      hostEl.addEventListener('dragstart', (e) => {
        const promptAnchor = resolvePromptAnchorFromDragEvent(e, hostEl);
        if (!promptAnchor) return;

        const id = extractPromptId(promptAnchor);
        const title = extractPromptTitle(promptAnchor) || '';
        const rawHref = promptAnchor.getAttribute('href') || promptAnchor.href || '';
        const url = rawHref.startsWith('http')
          ? rawHref
          : `${location.origin}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
        const data: DragData = { type: 'conversation', conversationId: id, title, url };
        setPromptDragData(e, data, hostEl);
      });
    });
  }

  /**
   * Observe the library table for dynamic row additions. Idempotent — repeated calls
   * are no-ops. Watches document.body so SPA navigations that swap the table subtree
   * don't leave us with a stale observer target.
   */
  observeLibraryTable(): void {
    if (this.libraryObserver) return;

    const bodyObserver = new MutationObserver((mutations) => {
      // Cheap gate: the library table only exists on /library; skip all selector work
      // elsewhere (the observer is also disconnected on route-away, this is a backstop).
      if (!/\/library(\/|$)/.test(location.pathname)) return;
      if (!libraryTableMutated(mutations)) return;
      this.bindDraggablesInLibraryTable();
    });
    try {
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    } catch {}
    this.libraryObserver = bodyObserver;
  }

  disconnectLibraryTableObserver(): void {
    if (!this.libraryObserver) return;
    try {
      this.libraryObserver.disconnect();
    } catch {}
    this.libraryObserver = null;
  }

  /**
   * Bind drag handlers to library table rows
   * Each row contains an anchor with href like /prompts/{id}
   */
  bindDraggablesInLibraryTable(): void {
    // The structure: <tr> > <td> > <a href="/prompts/..."> title </a>
    getLibraryPromptRows().forEach((tr) => {
      const anchor = getLibraryPromptAnchor(tr);
      if (!anchor) return;

      // Skip if already bound
      if ((tr as Element & { _gvLibraryDragBound?: boolean })._gvLibraryDragBound) return;
      (tr as Element & { _gvLibraryDragBound?: boolean })._gvLibraryDragBound = true;

      tr.draggable = true;
      tr.style.cursor = 'grab';

      // Disable the anchor's native drag: an <a href> is implicitly draggable as a URL,
      // which hijacks the drag from the row and produces a payload with no title.
      anchor.draggable = false;
      try {
        (anchor.style as CSSStyleDeclaration & { webkitUserDrag?: string }).webkitUserDrag = 'none';
      } catch {}

      const onDragStart = (e: DragEvent) => {
        // Prevent interference from Angular Material's own drag handling if any
        e.stopPropagation();
        const data = buildLibraryPromptData(tr);
        if (!data) return;
        setPromptDragData(e, data, tr);
        tr.style.opacity = '0.5';
      };

      this.options.bindLibraryRow(tr);

      // Primary: row-level drag covers every cell (icon, title, description, type, timestamp, overflow).
      tr.addEventListener('dragstart', onDragStart, true);

      // Fallback: if a browser still honors the anchor's default drag, populate the same JSON payload
      // so the dropped conversation carries its title instead of degrading to a raw URL.
      anchor.addEventListener('dragstart', onDragStart, true);

      tr.addEventListener('dragend', () => {
        tr.style.opacity = '';
      });
    });

    // Rows are bound opportunistically as the table updates; re-sync row state each pass.
    this.options.afterLibraryRowsBound();
  }

  async syncConversationTitles(): Promise<void> {
    if (!this.options.canEdit() || !hasStoredConversations(this.options.getData())) return;

    // One full-document scan up front; per-conversation lookups are then O(1) instead
    // of three full-document selector scans for every stored conversation.
    const nativeTitles = collectNativePromptTitles();
    if (nativeTitles.size === 0) return;

    const next = applyNativeTitles(this.options.getData(), nativeTitles, now());
    if (!next) return;

    this.options.setData(next);
    await this.options.save();
    this.options.render();
  }

  /** Disconnect both document observers and clear pending debounce timers. */
  destroy(): void {
    try {
      this.bodyPopoverObserver?.disconnect();
    } catch {}
    this.bodyPopoverObserver = null;
    this.disconnectLibraryTableObserver();
    this.clearTimers();
  }

  private schedulePromptListBinding(): void {
    if (this.promptListBindTimer !== null) return;
    this.promptListBindTimer = window.setTimeout(() => {
      this.promptListBindTimer = null;
      this.bindDraggablesInPromptList();
    }, PROMPT_LIST_BIND_DEBOUNCE_MS);
  }

  private schedulePromptTitleSync(): void {
    if (!hasStoredConversations(this.options.getData())) return;
    if (this.promptTitleSyncTimer !== null) return;

    this.promptTitleSyncTimer = window.setTimeout(() => {
      this.promptTitleSyncTimer = null;
      void this.runPromptTitleSync();
    }, PROMPT_TITLE_SYNC_DEBOUNCE_MS);
  }

  private async runPromptTitleSync(): Promise<void> {
    if (this.promptTitleSyncInProgress) return;

    this.promptTitleSyncInProgress = true;
    try {
      await this.syncConversationTitles();
    } finally {
      this.promptTitleSyncInProgress = false;
    }
  }

  private clearTimers(): void {
    if (this.promptListBindTimer !== null) {
      clearTimeout(this.promptListBindTimer);
      this.promptListBindTimer = null;
    }
    if (this.promptTitleSyncTimer !== null) {
      clearTimeout(this.promptTitleSyncTimer);
      this.promptTitleSyncTimer = null;
    }
  }
}
