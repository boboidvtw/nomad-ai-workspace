/**
 * Saved-library actions for the prompt manager: load and delete the current
 * account's highlights through the background worker, and open a saved item.
 */
import browser from 'webextension-polyfill';

import {
  accountIsolationService,
  detectAccountContextFromDocument,
} from '@/core/services/AccountIsolationService';
import { logger } from '@/core/services/LoggerService';
import type { HighlightAccountScope, HighlightRecordV1 } from '@/core/types/highlight';
import { type SavedLibraryItem, buildSavedLibraryItemUrl } from '@/features/savedLibrary/model';

export async function resolveCurrentHighlightScope(): Promise<HighlightAccountScope> {
  try {
    const context = detectAccountContextFromDocument(window.location.href, document);
    const resolved = await accountIsolationService.resolveAccountScope({
      pageUrl: window.location.href,
      routeUserId: context.routeUserId,
      email: context.email,
    });
    return {
      platform: window.location.hostname.startsWith('aistudio.') ? 'aistudio' : 'gemini',
      accountKey: resolved.accountKey,
      accountId: resolved.accountId,
      routeUserId: resolved.routeUserId,
    };
  } catch {
    return {
      platform: 'gemini',
      accountKey: 'anonymous',
      accountId: 0,
      routeUserId: null,
    };
  }
}

export async function loadCurrentAccountHighlightRecords(): Promise<HighlightRecordV1[]> {
  const hostname = window.location.hostname;
  if (!hostname.includes('gemini.google.') && !hostname.includes('aistudio.google.')) {
    return [];
  }
  try {
    const scope = await resolveCurrentHighlightScope();
    const response = (await browser.runtime.sendMessage({
      type: 'gv.highlight.list',
      payload: { scope, includeDeleted: false },
    })) as { ok?: boolean; records?: HighlightRecordV1[]; error?: string } | undefined;
    if (!response?.ok) return [];
    return Array.isArray(response.records) ? response.records : [];
  } catch {
    return [];
  }
}

export async function removeStoredHighlight(item: SavedLibraryItem): Promise<boolean> {
  if (item.kind !== 'highlight' || !item.accountHash || !item.platform) return false;
  try {
    const scope = await resolveCurrentHighlightScope();
    const response = (await browser.runtime.sendMessage({
      type: 'gv.highlight.delete',
      payload: {
        scope,
        conversationId: item.conversationId,
        id: item.id,
      },
    })) as { ok?: boolean } | undefined;
    return response?.ok === true;
  } catch (error) {
    logger.warn('[PromptManager] Failed to remove highlight', { error: String(error) });
    return false;
  }
}

export function navigateToSavedLibraryItem(item: SavedLibraryItem): boolean {
  let target: URL;
  try {
    target = new URL(buildSavedLibraryItemUrl(item), window.location.href);
  } catch (error) {
    logger.warn('[PromptManager] Blocked invalid saved item URL', { error: String(error) });
    return false;
  }
  if (target.origin !== window.location.origin) {
    window.open(target.href, '_blank', 'noopener,noreferrer');
    return true;
  }

  window.history.pushState(
    window.history.state,
    '',
    `${target.pathname}${target.search}${target.hash}`,
  );
  window.dispatchEvent(
    typeof PopStateEvent === 'function'
      ? new PopStateEvent('popstate', { state: window.history.state })
      : new Event('popstate'),
  );
  return true;
}
