/**
 * AI Studio "hide archived": /library rows whose prompt is filed into a real folder get
 * a hide class while the setting is on, and an onboarding nudge offers the setting once
 * the user has filed something. Both flags live in AI Studio-only sync keys.
 */
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

import { extractPromptIdFromHref } from './aistudioPromptLinks';
import {
  mountHideArchivedNudge,
  shouldShowHideArchivedNudge,
  unmountHideArchivedNudge,
} from './hideArchivedNudge';
import type { FolderData } from './types';

const ARCHIVED_ROW_CLASS = 'gv-conversation-archived';

export interface HideArchivedOptions {
  getData: () => FolderData;
  getContainer: () => HTMLElement | null;
  uncategorizedKey: string;
}

/**
 * A conversation is "archived" if any non-uncategorized folder contains it. Build
 * the id set once per hide-archived pass so the per-row check is O(1) instead of
 * scanning every folder's contents for every table row.
 */
export function collectArchivedConversationIds(
  data: FolderData,
  uncategorizedKey: string,
): Set<string> {
  const archived = new Set<string>();
  for (const [folderId, conversations] of Object.entries(data.folderContents)) {
    if (folderId === uncategorizedKey) continue;
    if (!Array.isArray(conversations)) continue;
    for (const conversation of conversations) {
      archived.add(conversation.conversationId);
    }
  }
  return archived;
}

/**
 * Returns true when the user has at least one conversation filed into a real folder
 * (uncategorized doesn't count). Used to decide whether to show the onboarding nudge
 * — showing it with an empty state would be a mystery card.
 */
export function hasAnyArchivedConversation(data: FolderData, uncategorizedKey: string): boolean {
  for (const [folderId, conversations] of Object.entries(data.folderContents)) {
    if (folderId === uncategorizedKey) continue;
    if (Array.isArray(conversations) && conversations.length > 0) return true;
  }
  return false;
}

/** Un-hide any /library rows we hid; with the feature off nothing would restore them. */
export function unhideArchivedRows(): void {
  document
    .querySelectorAll(`.${ARCHIVED_ROW_CLASS}`)
    .forEach((row) => row.classList.remove(ARCHIVED_ROW_CLASS));
}

export class AIStudioHideArchived {
  /** Hide filed conversations in the /library table. */
  enabled = false;
  /** The nudge was dismissed, or the setting was enabled from it. */
  nudgeShown = false;

  constructor(private readonly options: HideArchivedOptions) {}

  /**
   * Load the AI Studio hide-archived settings. Kept fully separate from the Gemini keys
   * so a user who toggled the feature on Gemini is not surprised when they open AI Studio.
   */
  async load(): Promise<void> {
    try {
      const result = await browser.storage.sync.get({
        [StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS_AISTUDIO]: false,
        [StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO]: false,
      });
      this.enabled = result[StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS_AISTUDIO] === true;
      this.nudgeShown = result[StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO] === true;
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to load hide-archived settings:', error);
      this.enabled = false;
      this.nudgeShown = false;
    }
  }

  async setEnabled(next: boolean): Promise<void> {
    this.enabled = next;
    try {
      await browser.storage.sync.set({
        [StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS_AISTUDIO]: next,
      });
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to save hide-archived setting:', error);
    }
  }

  async markNudgeShown(): Promise<void> {
    this.nudgeShown = true;
    try {
      await browser.storage.sync.set({
        [StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO]: true,
      });
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to persist nudge-shown flag:', error);
    }
  }

  /** Take the enabled flag another tab stored. */
  applyStoredEnabled(value: unknown): void {
    this.enabled = value === true;
    this.applyToLibraryTable();
    this.updateNudgeVisibility();
  }

  /** Take the nudge flag another tab stored. */
  applyStoredNudgeShown(value: unknown): void {
    this.nudgeShown = value === true;
    this.updateNudgeVisibility();
  }

  /**
   * Decide whether to mount or unmount the AI Studio hide-archived nudge. Safe to call
   * from any state change path — idempotent and cheap.
   */
  updateNudgeVisibility(): void {
    const container = this.options.getContainer();
    if (!container) return;

    const eligible =
      shouldShowHideArchivedNudge({
        nudgeShown: this.nudgeShown,
        hideArchivedAlreadyOn: this.enabled,
      }) && hasAnyArchivedConversation(this.options.getData(), this.options.uncategorizedKey);

    if (!eligible) {
      unmountHideArchivedNudge(container);
      return;
    }

    mountHideArchivedNudge({
      container,
      variantClass: 'gv-hide-archived-nudge--aistudio',
      i18nKeys: {
        title: 'aistudio_hide_archived_nudge_title',
        body: 'aistudio_hide_archived_nudge_body',
        enable: 'aistudio_hide_archived_nudge_enable',
        dismiss: 'aistudio_hide_archived_nudge_dismiss',
        footnote: 'aistudio_hide_archived_nudge_footnote',
      },
      onEnable: () => {
        void this.setEnabled(true).then(() => this.markNudgeShown());
      },
      onDismiss: () => {
        void this.markNudgeShown();
      },
    });
  }

  /**
   * Toggle the hide class on every table row in /library according to the current
   * setting and folder membership. No-op outside /library.
   */
  applyToLibraryTable(): void {
    if (!/\/library(\/|$)/.test(location.pathname)) return;
    const rows = document.querySelectorAll<HTMLElement>('tr.mat-mdc-row, tr[mat-row]');
    if (rows.length === 0) return;
    const archivedIds = collectArchivedConversationIds(
      this.options.getData(),
      this.options.uncategorizedKey,
    );
    rows.forEach((row) => {
      const anchor = row.querySelector(
        'a[href^="/prompts/"], a.name-btn[href*="/prompts/"]',
      ) as HTMLAnchorElement | null;
      if (!anchor) return;
      const id = extractPromptIdFromHref(anchor.getAttribute('href') || anchor.href || '');
      if (!id) return;
      row.classList.toggle(ARCHIVED_ROW_CLASS, this.enabled && archivedIds.has(id));
    });
  }
}
