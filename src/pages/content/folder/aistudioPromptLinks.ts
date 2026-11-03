import { normalizeText } from './aistudioUtils';
/**
 * AI Studio prompt links: the selectors that find them, and reading ids, titles and
 * drag payloads off them. Pure DOM reads, no manager state.
 */
import type { DragData } from './types';

const PROMPT_LINK_SELECTORS = [
  'a[href^="/prompts/"]',
  'a[href^="/u/"][href*="/prompts/"]',
  'a[href*="://aistudio.google.com/prompts/"]',
  'a[href*="://aistudio.google.com/u/"][href*="/prompts/"]',
  'a[href*="://aistudio.google.cn/prompts/"]',
  'a[href*="://aistudio.google.cn/u/"][href*="/prompts/"]',
];
export const PROMPT_LINK_SELECTOR = PROMPT_LINK_SELECTORS.join(', ');
export const UNBOUND_PROMPT_LINK_SELECTOR = PROMPT_LINK_SELECTORS.map(
  (selector) => `${selector}:not([data-gv-drag-bound])`,
).join(', ');
export const BODY_PROMPT_POPOVER_SELECTOR = [
  '.cdk-overlay-container',
  '.cdk-overlay-pane',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="dialog"]',
].join(', ');
export const PROMPT_DRAG_HOST_SELECTORS = [
  '[data-test-id^="history-item"]',
  '[role="listitem"]',
  '.mat-mdc-list-item',
  'li',
];

export type LibraryPromptData = DragData & { conversationId: string };

export function nodeContainsPromptLink(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  if (node.matches(PROMPT_LINK_SELECTOR)) return true;
  return !!node.querySelector(PROMPT_LINK_SELECTOR);
}

export function mutationAddsPromptLinks(mutations: MutationRecord[]): boolean {
  for (const mutation of mutations) {
    for (const node of Array.from(mutation.addedNodes)) {
      if (nodeContainsPromptLink(node)) return true;
    }
  }
  return false;
}

export function mutationMayAffectPromptTitles(mutations: MutationRecord[]): boolean {
  for (const mutation of mutations) {
    if (mutation.type === 'characterData') {
      if (mutation.target.parentElement?.closest(PROMPT_LINK_SELECTOR)) return true;
      continue;
    }

    if (mutation.type === 'attributes') {
      if (mutation.target instanceof Element && mutation.target.closest(PROMPT_LINK_SELECTOR))
        return true;
      continue;
    }

    if (mutation.type === 'childList') {
      if (mutation.target instanceof Element && mutation.target.closest(PROMPT_LINK_SELECTOR)) {
        return true;
      }

      for (const node of Array.from(mutation.addedNodes)) {
        if (nodeContainsPromptLink(node)) return true;
      }
      for (const node of Array.from(mutation.removedNodes)) {
        if (nodeContainsPromptLink(node)) return true;
      }
    }
  }
  return false;
}

export function extractPromptIdFromHref(rawHref: string): string | null {
  const href = String(rawHref || '').trim();
  if (!href) return null;
  const match = href.match(/\/prompts\/([^/?#]+)/);
  if (match && match[1]) return match[1];
  try {
    const url = new URL(href, location.origin);
    const pathMatch = url.pathname.match(/\/prompts\/([^/?#]+)/);
    return pathMatch?.[1] || null;
  } catch {
    return null;
  }
}

function normalizeDroppedUrl(raw: string): string | null {
  const firstLine = String(raw || '')
    .split(/\r?\n/, 1)[0]
    ?.trim();
  if (!firstLine) return null;
  if (/^https?:\/\//i.test(firstLine)) return firstLine;
  if (firstLine.startsWith('/')) return `${location.origin}${firstLine}`;
  return null;
}

export function parseDragDataPayload(raw: string): DragData | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as { type?: unknown }).type === 'conversation' &&
      typeof (parsed as { conversationId?: unknown }).conversationId === 'string'
    ) {
      const data = parsed as DragData;
      return {
        type: 'conversation',
        conversationId: data.conversationId,
        title: typeof data.title === 'string' ? data.title : '',
        url: typeof data.url === 'string' ? data.url : '',
      };
    }
  } catch {}

  const normalizedUrl = normalizeDroppedUrl(trimmed);
  if (!normalizedUrl) return null;
  const conversationId = extractPromptIdFromHref(normalizedUrl);
  if (!conversationId) return null;

  return {
    type: 'conversation',
    conversationId,
    title: '',
    url: normalizedUrl,
  };
}

export function extractPromptId(anchor: HTMLAnchorElement): string {
  const rawHref = anchor.getAttribute('href') || anchor.href || '';
  const id = extractPromptIdFromHref(rawHref);
  if (id) return id;

  try {
    const u = new URL(rawHref, location.origin);
    const parts = (u.pathname || '').split('/').filter(Boolean);
    // Expected format: /prompts/{id} -> ['', 'prompts', '{id}']
    if (parts.length >= 2 && parts[0] === 'prompts') {
      return parts[1];
    }
    return parts[1] || rawHref;
  } catch {
    return rawHref;
  }
}

export function extractPromptTitle(anchor: HTMLAnchorElement | null): string | null {
  if (!anchor) return null;

  const aria = normalizeText(anchor.getAttribute('aria-label'));
  if (aria) return aria;

  const title = normalizeText(anchor.getAttribute('title'));
  if (title) return title;

  const text = normalizeText(anchor.textContent);
  if (text) return text;

  return null;
}

export function setPromptDragData(e: DragEvent, data: DragData, dragImageEl: HTMLElement): void {
  try {
    const transfer = e.dataTransfer;
    if (!transfer) return;
    const json = JSON.stringify(data);
    transfer.effectAllowed = 'move';
    transfer.setData('application/json', json);
    transfer.setData('text/plain', json);
    if (data.url) {
      transfer.setData('text/uri-list', data.url);
      transfer.setData('text/x-moz-url', `${data.url}\n${data.title || ''}`);
    }
  } catch {}
  try {
    e.dataTransfer?.setDragImage(dragImageEl, 10, 10);
  } catch {}
}

export function parseDragDataFromEvent(event: DragEvent): DragData | null {
  const transfer = event.dataTransfer;
  if (!transfer) return null;

  const candidates = [
    transfer.getData('application/json'),
    transfer.getData('text/plain'),
    transfer.getData('text/uri-list'),
    transfer.getData('text/x-moz-url'),
    transfer.getData('URL'),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = parseDragDataPayload(candidate);
    if (parsed) return parsed;
  }

  return null;
}

export function getLibraryPromptRows(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('tr.mat-mdc-row, tr[mat-row], tr[role="row"]'),
  ).filter((row) => !!getLibraryPromptAnchor(row));
}

export function getLibraryPromptAnchor(row: HTMLElement): HTMLAnchorElement | null {
  return row.querySelector(PROMPT_LINK_SELECTOR) as HTMLAnchorElement | null;
}

export function buildLibraryPromptData(row: HTMLElement): LibraryPromptData | null {
  const anchor = getLibraryPromptAnchor(row);
  if (!anchor) return null;
  const conversationId = extractPromptId(anchor);
  if (!conversationId) return null;
  const title = extractPromptTitle(anchor) || '';
  const rawHref = anchor.getAttribute('href') || anchor.href || '';
  const url = rawHref.startsWith('http')
    ? rawHref
    : `${location.origin}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
  return { type: 'conversation', conversationId, title, url };
}
