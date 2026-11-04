import browser, { type Runtime } from 'webextension-polyfill';

import {
  type AccountScope,
  accountIsolationService,
  buildScopedStorageKey,
  detectAccountContextFromDocument,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import type { PromptItem, SyncAccountScope } from '@/core/types/sync';
import { isSafari } from '@/core/utils/browser';
import { createTranslator, initI18n } from '@/utils/i18n';
import {
  mergeFolderData as mergeSyncedFolderData,
  mergePrompts as mergeSyncedPrompts,
} from '@/utils/merge';

import { watchRouteChanges } from '../utils/routeWatcher';
import { FolderDataSession } from './FolderDataSession';
import { AIStudioFolderTree, createIcon } from './aistudioFolderTree';
import { AIStudioHideArchived, unhideArchivedRows } from './aistudioHideArchived';
import { mountLibraryDropZone } from './aistudioLibraryDropZone';
import { AIStudioLibraryMultiSelect } from './aistudioLibraryMultiSelect';
import { AIStudioPromptListBinding } from './aistudioPromptListBinding';
import { AIStudioSidebarWidth, SIDEBAR_WIDTH_KEY } from './aistudioSidebarWidth';
import { AISTUDIO_FOLDER_STYLE_ID, injectAIStudioFolderStyles } from './aistudioStyles';
import { exportTimestamp, getCloudTooltip, mergeImportedFolderData } from './aistudioTransfer';
import { downloadJSON, validateFolderData, waitForElement } from './aistudioUtils';
import type { FolderData } from './types';

const NOTIFICATION_TIMEOUT_MS = 5000;

export { mutationAddsPromptLinks, parseDragDataPayload } from './aistudioPromptLinks';

export class AIStudioFolderManager {
  /**
   * `createTranslator` resolves against the bundled messages on every call, so
   * it is already correct before `init` awaits `initI18n` - the previous
   * identity default put raw keys such as `folder_multi_select_count` on screen
   * for any UI built ahead of that await.
   */
  private t: (key: string) => string = createTranslator();
  private dataSession: FolderDataSession | null = new FolderDataSession(
    StorageKeys.FOLDER_DATA_AISTUDIO,
    'aistudio-folders',
    null,
    validateFolderData,
  );
  private readonly dataSessions = new Map<string, FolderDataSession>();
  private unresolvedData: FolderData = { folders: [], folderContents: {} };
  private accountScopeRequest = 0;
  private get data(): FolderData {
    return this.dataSession?.data ?? this.unresolvedData;
  }
  private set data(data: FolderData) {
    if (this.dataSession) this.dataSession.data = data;
    else this.unresolvedData = data;
  }
  private get canEdit(): boolean {
    return this.dataSession?.ready === true && !this.dataSession.replacingData;
  }
  private container: HTMLElement | null = null;
  private historyRoot: HTMLElement | null = null;
  private cleanupFns: Array<() => void> = [];
  private readonly libraryMultiSelect = new AIStudioLibraryMultiSelect({
    t: (key) => this.t(key),
    showNotification: (message, level) => this.showNotification(message, level),
    createIcon,
  });
  private readonly STORAGE_KEY = StorageKeys.FOLDER_DATA_AISTUDIO;
  private folderEnabled: boolean = true; // Whether folder feature is enabled
  private accountIsolationEnabled: boolean = false; // Whether hard account isolation is enabled
  private accountScope: AccountScope | null = null; // Resolved account scope for current account
  private activeStorageKey: string = StorageKeys.FOLDER_DATA_AISTUDIO; // Active folder data key
  private accountContextPoller: number | null = null; // Detect account switches
  private lastAccountContextFingerprint: string | null = null; // Debounce account scope refresh
  private resolvingAccountContextFingerprint: string | null = null;
  private stopRouteWatcher: (() => void) | null = null;
  private readonly sidebarWidth = new AIStudioSidebarWidth({
    isExtensionContextValid: () => this.isExtensionContextValid(),
  });
  private readonly UNCATEGORIZED_KEY = '__uncategorized__'; // Special key for root-level conversations
  private readonly hideArchived = new AIStudioHideArchived({
    getData: () => this.data,
    getContainer: () => this.container,
    uncategorizedKey: this.UNCATEGORIZED_KEY,
  });
  private readonly folderTree = new AIStudioFolderTree({
    t: (key) => this.t(key),
    getContainer: () => this.container,
    getData: () => this.data,
    setData: (data) => {
      this.data = data;
    },
    canEdit: () => this.canEdit,
    save: () => this.save(),
    render: () => this.render(),
    navigateToPrompt: (promptId, url) => this.navigateToPrompt(promptId, url),
    uncategorizedKey: this.UNCATEGORIZED_KEY,
  });
  // Accessors kept for tests that read the old private fields.
  private get hideArchivedEnabled(): boolean {
    return this.hideArchived.enabled;
  }
  private set hideArchivedEnabled(enabled: boolean) {
    this.hideArchived.enabled = enabled;
  }

  async init(): Promise<void> {
    // Refresh the cached language, then rebind so later calls read it.
    await initI18n();
    this.t = createTranslator();

    // Migrate data from chrome.storage.sync to chrome.storage.local (one-time)
    await this.migrateFromSyncToLocal();

    // Only enable on prompts, library, or root pages
    // Root path (/) is where the main playground is, prompts are saved chats, library is history
    const isValidPath =
      /^\/(prompts|library)(\/|$)/.test(location.pathname) || location.pathname === '/';
    if (!isValidPath) return;

    // Load folder enabled setting
    await this.loadFolderEnabledSetting();
    await this.loadHideArchivedSettings();

    // Load account isolation setting/scope before reading folder data.
    await this.loadAccountIsolationSetting();
    await this.refreshAccountScope(true);

    // Load sidebar width setting
    await this.sidebarWidth.load();

    // Set up storage change listener (always needed to respond to setting changes)
    this.setupStorageListener();

    // Keep account-scoped data aligned with current AI Studio account.
    this.setupAccountContextPoller();

    // Setup message listener for sync operations (always needed)
    this.setupMessageListener();

    // If folder feature is disabled, skip initialization
    if (!this.folderEnabled) {
      return;
    }

    // Initialize folder UI
    await this.initializeFolderUI();
  }

  /**
   * Migrate folder data from chrome.storage.sync to chrome.storage.local
   * This is a one-time migration for users upgrading from older versions
   * Benefits: No 100KB quota limit, consistent with Gemini storage
   */
  private async migrateFromSyncToLocal(): Promise<void> {
    try {
      // Check if there's data in chrome.storage.sync
      const syncResult = await chrome.storage.sync.get(this.STORAGE_KEY);
      const syncData = syncResult[this.STORAGE_KEY];

      if (syncData && validateFolderData(syncData)) {
        // Check if chrome.storage.local already has data
        const localResult = await chrome.storage.local.get(this.STORAGE_KEY);
        const localData = localResult[this.STORAGE_KEY];

        if (!localData || !validateFolderData(localData)) {
          // Migrate sync data to local storage
          await chrome.storage.local.set({ [this.STORAGE_KEY]: syncData });
          console.log('[AIStudioFolderManager] Migrated folder data from sync to local storage');

          // Optionally clear sync storage after successful migration
          // await chrome.storage.sync.remove(this.STORAGE_KEY);
        } else {
          // Both have data - merge them (local takes priority for conflicts)
          const mergedFolders = this.mergeFolderData(
            localData as FolderData,
            syncData as FolderData,
          );
          await chrome.storage.local.set({ [this.STORAGE_KEY]: mergedFolders });
          console.log('[AIStudioFolderManager] Merged sync and local folder data');
        }
      }
    } catch (error) {
      console.warn('[AIStudioFolderManager] Migration from sync to local failed:', error);
      // Don't throw - migration failure should not block normal operation
    }
  }

  /**
   * Simple merge of folder data (used during migration)
   * Local data takes priority for conflicts
   */
  private mergeFolderData(local: FolderData, sync: FolderData): FolderData {
    const mergedFolders = [...local.folders];
    const localFolderIds = new Set(local.folders.map((f) => f.id));

    // Add folders from sync that don't exist in local
    for (const folder of sync.folders) {
      if (!localFolderIds.has(folder.id)) {
        mergedFolders.push(folder);
      }
    }

    // Merge folder contents
    const mergedContents = { ...local.folderContents };
    for (const [folderId, conversations] of Object.entries(sync.folderContents)) {
      if (!mergedContents[folderId]) {
        mergedContents[folderId] = conversations;
      } else {
        // Merge conversations, avoiding duplicates
        const existingIds = new Set(mergedContents[folderId].map((c) => c.conversationId));
        for (const conv of conversations) {
          if (!existingIds.has(conv.conversationId)) {
            mergedContents[folderId].push(conv);
          }
        }
      }
    }

    return { folders: mergedFolders, folderContents: mergedContents };
  }

  private cloneFolderData(data: FolderData): FolderData {
    const folders = data.folders.map((folder) => ({ ...folder }));
    const folderContents = Object.fromEntries(
      Object.entries(data.folderContents || {}).map(([folderId, conversations]) => [
        folderId,
        conversations.map((conversation) => ({ ...conversation })),
      ]),
    );
    return { folders, folderContents };
  }

  private async migrateLegacyFolderDataToScopedStorage(
    session: FolderDataSession,
    version: number,
  ): Promise<FolderData | null> {
    try {
      const legacyResult = await chrome.storage.local.get(this.STORAGE_KEY);
      const legacyData = legacyResult[this.STORAGE_KEY];
      if (
        this.dataSession !== session ||
        session.loadVersion !== version ||
        !legacyData ||
        !validateFolderData(legacyData)
      ) {
        return null;
      }

      const migratedData = this.cloneFolderData(legacyData as FolderData);
      session.data = migratedData;
      session.markReady();
      session.activeSave = this.persistDataSession(session, this.cloneFolderData(migratedData));
      await session.activeSave;
      console.log(
        '[AIStudioFolderManager] Migrated legacy AI Studio folder data to scoped storage:',
        session.storageKey,
      );
      return migratedData;
    } catch (error) {
      console.warn(
        '[AIStudioFolderManager] Failed to migrate scoped AI Studio folder data:',
        error,
      );
      return null;
    }
  }

  private toSyncAccountScope(scope: AccountScope | null): SyncAccountScope | undefined {
    if (!scope) return undefined;
    return {
      accountKey: scope.accountKey,
      accountId: scope.accountId,
      routeUserId: scope.routeUserId,
    };
  }

  private buildAccountContextFingerprint(routeUserId: string | null, email: string | null): string {
    return `${routeUserId || ''}::${email || ''}`;
  }

  private async loadAccountIsolationSetting(): Promise<void> {
    try {
      this.accountIsolationEnabled = await accountIsolationService.isIsolationEnabled({
        platform: 'aistudio',
        pageUrl: window.location.href,
      });
      console.log(
        '[AIStudioFolderManager] Loaded account isolation setting:',
        this.accountIsolationEnabled,
      );
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to load account isolation setting:', error);
      this.accountIsolationEnabled = false;
    }
  }

  private async refreshAccountScope(force: boolean = false): Promise<boolean> {
    const context = detectAccountContextFromDocument(window.location.href, document);
    const fingerprint = this.accountIsolationEnabled
      ? this.buildAccountContextFingerprint(context.routeUserId, context.email)
      : null;
    if (
      !force &&
      ((this.dataSession && fingerprint === this.lastAccountContextFingerprint) ||
        (fingerprint !== null && fingerprint === this.resolvingAccountContextFingerprint))
    ) {
      return false;
    }
    const request = ++this.accountScopeRequest;
    this.resolvingAccountContextFingerprint = fingerprint;
    const previous = this.dataSession;
    previous?.deactivate();
    if (previous && !previous.saveInProgress && !previous.replacingData) {
      this.dataSessions.delete(previous.storageKey);
    }
    this.dataSession = null;
    this.unresolvedData = { folders: [], folderContents: {} };
    this.accountScope = null;
    this.activeStorageKey = '';
    if (this.libraryMultiSelect.active) this.libraryMultiSelect.exit();
    document.querySelector('.gv-folder-confirm-dialog.gv-aistudio-confirm')?.remove();
    document.querySelector('.gv-folder-menu.gv-aistudio-folder-menu')?.remove();
    document.querySelector('.gv-library-folder-list')?.replaceChildren();
    this.render();
    this.applyHideArchivedToLibraryTable();
    try {
      const resolvedScope = this.accountIsolationEnabled
        ? await accountIsolationService.resolveAccountScope({
            pageUrl: window.location.href,
            routeUserId: context.routeUserId,
            email: context.email,
          })
        : null;
      if (request !== this.accountScopeRequest) return false;
      const storageKey = resolvedScope
        ? buildScopedStorageKey(this.STORAGE_KEY, resolvedScope.accountKey)
        : this.STORAGE_KEY;
      const session =
        this.dataSessions.get(storageKey) ??
        (previous?.storageKey === storageKey
          ? previous
          : new FolderDataSession(
              storageKey,
              'aistudio-folders',
              resolvedScope,
              validateFolderData,
            ));
      this.dataSessions.set(storageKey, session);
      session.accountScope = resolvedScope;
      this.dataSession = session;
      this.accountScope = resolvedScope;
      this.activeStorageKey = storageKey;
      this.lastAccountContextFingerprint = fingerprint;
      session.activate();
      if (session.ready) this.render();
      return previous !== session;
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to resolve account scope:', error);
      // Leave persistence unbound, and allow the next poll to retry resolution.
      return false;
    } finally {
      if (request === this.accountScopeRequest) this.resolvingAccountContextFingerprint = null;
    }
  }

  private async handleAccountIsolationToggle(enabled: boolean): Promise<void> {
    if (enabled === this.accountIsolationEnabled) return;

    this.accountIsolationEnabled = enabled;
    await this.refreshAccountScope(true);
    await this.load();
    if (this.folderEnabled && this.container) {
      this.render();
    }
  }

  private setupAccountContextPoller(): void {
    if (this.accountContextPoller) {
      clearInterval(this.accountContextPoller);
      this.accountContextPoller = null;
    }

    this.accountContextPoller = window.setInterval(() => {
      void this.refreshScopedDataOnAccountContextChange();
    }, 1200);
    // No cleanupFns registration: destroy() clears this.accountContextPoller directly,
    // so repeated setup calls cannot grow the cleanup list.
  }

  private async refreshScopedDataOnAccountContextChange(): Promise<void> {
    if (!this.accountIsolationEnabled) return;
    const changed = await this.refreshAccountScope(false);
    if (!changed) return;

    await this.load();
    if (this.folderEnabled && this.container) {
      this.render();
    }
    console.log(
      '[AIStudioFolderManager] Switched account-scoped folder storage:',
      this.activeStorageKey,
    );
  }

  /**
   * Setup message listener for sync operations
   * Handles gv.sync.requestData and gv.folders.reload messages from popup
   */
  private setupMessageListener(): void {
    const listener = (
      message: unknown,
      _sender: Runtime.MessageSender,
      sendResponse: (response: unknown) => void,
    ): true | undefined => {
      const msg = message as Record<string, unknown>;
      // Handle request for folder data (for cloud sync upload)
      if (msg?.type === 'gv.sync.requestData') {
        console.log('[AIStudioFolderManager] Received request for folder data from popup');
        sendResponse({
          ok: true,
          data: this.data,
          accountScope: this.toSyncAccountScope(this.accountScope),
        });
        return true;
      }

      // Handle reload request (after cloud sync download)
      if (msg?.type === 'gv.folders.reload') {
        console.log('[AIStudioFolderManager] Received reload request from sync');
        this.load().then(() => {
          this.render();
          console.log('[AIStudioFolderManager] Folder data reloaded from sync');
        });
        sendResponse({ ok: true });
        return true;
      }

      // Unknown message: return undefined so the sender's promise settles immediately.
      // Returning true here would declare an async response that never arrives, leaving
      // senders (e.g. background broadcasts awaiting chrome.tabs.sendMessage) hanging.
      return undefined;
    };
    // The polyfill's OnMessageListener typing cannot express "sync-respond to some
    // messages, ignore the rest" (its callback variant requires a constant `true`
    // return). Runtime behavior is well-defined for both values, so cast: `true`
    // keeps the channel open for handled messages, `undefined` closes it for
    // unknown ones.
    browser.runtime.onMessage.addListener(listener as Runtime.OnMessageListenerCallback);
  }

  private async initializeFolderUI(): Promise<void> {
    const isLibraryPage = /\/library(\/|$)/.test(location.pathname);

    // Wait for a *stable* insertion anchor rather than just the outer nav-content.
    // Angular renders the shell first and fills in children asynchronously; waiting only on
    // the shell caused intermittent mis-mounts where the anchor wasn't there yet and we
    // fell through to an awkward appendChild position (or appeared to "never mount" at all).
    const anchorSelector = [
      'ms-prompt-history-v3',
      '.nav-content.v3-left-nav > nav > .empty-space',
      '.nav-content.v3-left-nav > nav > .bottom-actions',
    ].join(', ');
    const mountSignal = await waitForElement<HTMLElement>(anchorSelector);

    this.historyRoot =
      (document.querySelector('ms-prompt-history-v3') as HTMLElement | null) ?? null;

    if (!mountSignal) return;

    try {
      document.documentElement.classList.add('gv-aistudio-root');
    } catch {}

    await this.load();

    // Inject the sidebar folder panel anywhere a mount anchor exists — including /library.
    // Previously /library skipped the sidebar because legacy AI Studio had no place to mount
    // it there; the V2 nav has `.empty-space`/`.bottom-actions` on every page, so users
    // should see their folders while triaging the history table.
    this.injectUI();

    // Self-heal: Angular can tear down and rebuild the nav on route transitions, which
    // silently detaches our container. Watch the nav root and re-inject on detach.
    this.watchContainerMount();

    // Observers that read prompt-link anchors only run when the legacy history panel is present.
    if (this.historyRoot) {
      this.observePromptList();
      this.bindDraggablesInPromptList();
      await this.syncConversationTitlesFromPromptList();
    }

    // V2 nav renders History recents in a body-level hover popover rather than
    // inline ms-prompt-history-v3 rows. Bind those transient links as they appear.
    this.observeBodyPromptPopovers();

    // These work off our own folder DOM + location, so they run in both legacy and V2 nav.
    this.highlightActiveConversation();
    this.installRouteChangeListener();

    // Apply initial sidebar width (force on first load)
    this.sidebarWidth.apply(true);

    // Add resize handle for sidebar width adjustment
    const removeResizeHandle = this.sidebarWidth.attachResizeHandle();
    if (removeResizeHandle) this.cleanupFns.push(removeResizeHandle);

    // On library page, also bind the table rows as drag sources and surface the floating
    // drop zone (belt-and-suspenders alongside the sidebar panel).
    if (isLibraryPage) {
      this.observeLibraryTable();
      this.bindDraggablesInLibraryTable();
      this.injectLibraryDropZone();
    }
  }

  private containerMountObserver: MutationObserver | null = null;
  private lastContainerReinjectAt: number = 0;
  private libraryShortcutBtn: HTMLButtonElement | null = null;
  private readonly promptListBinding = new AIStudioPromptListBinding({
    getHistoryRoot: () => this.historyRoot,
    getData: () => this.data,
    setData: (data) => {
      this.data = data;
    },
    canEdit: () => this.canEdit,
    save: () => this.save(),
    render: () => this.render(),
    highlightActiveConversation: () => this.highlightActiveConversation(),
    bindLibraryRow: (row) => this.libraryMultiSelect.bindRow(row),
    afterLibraryRowsBound: () => {
      this.applyHideArchivedToLibraryTable();
      this.libraryMultiSelect.updateUI();
    },
  });
  // Accessors kept for tests that read the old private fields.
  private get libraryTableObserver(): MutationObserver | null {
    return this.promptListBinding.libraryTableObserver;
  }
  private get bodyPromptPopoverObserver(): MutationObserver | null {
    return this.promptListBinding.bodyPromptPopoverObserver;
  }
  private libraryDropZoneInjected: boolean = false;

  /**
   * Watches the AI Studio left nav for Angular tear-downs that would silently detach
   * our folder panel, and re-injects it. Cheap reconciliation: each mutation just checks
   * whether `this.container` is still in the document, throttled to avoid flapping.
   */
  private watchContainerMount(): void {
    try {
      this.containerMountObserver?.disconnect();
    } catch {}
    this.containerMountObserver = null;

    const navContent = document.querySelector('.nav-content.v3-left-nav');
    if (!navContent) return;

    const observer = new MutationObserver(() => {
      const container = this.container;
      if (!container) return;
      if (document.body.contains(container)) return;

      // Throttle re-injection — browsers fire many mutations in a single tick during
      // an Angular re-render. We only need to run once per burst.
      const nowTs = Date.now();
      if (nowTs - this.lastContainerReinjectAt < 250) return;
      this.lastContainerReinjectAt = nowTs;

      this.container = null;
      try {
        this.injectUI();
      } catch (error) {
        console.error('[AIStudioFolderManager] Failed to re-inject folder panel:', error);
      }
    });

    try {
      observer.observe(navContent, { childList: true, subtree: true });
    } catch {}
    this.containerMountObserver = observer;
    // No cleanupFns registration: this method re-arms on every route change, so a
    // per-call push would grow the cleanup list without bound. destroy() disconnects
    // this.containerMountObserver directly.
  }

  private async load(): Promise<void> {
    const session = this.dataSession;
    if (!session) return;
    // A returning account may still own a queued edit that is newer than disk.
    if ((session.saveInProgress || session.replacingData) && session.ready) return;
    const version = ++session.loadVersion;
    const isCurrent = () => this.dataSession === session && session.loadVersion === version;
    try {
      // On Safari, restore recovery backups from the durable mirror before any
      // recoverFromBackup() can run (localStorage may have been ITP-evicted).
      await session.backup.ensureHydrated();
      if (!isCurrent()) return;

      // Use chrome.storage.local with account-scoped key when isolation is enabled.
      const result = await chrome.storage.local.get(session.storageKey);
      if (!isCurrent()) return;
      let data = result[session.storageKey];

      if (!data && session.accountScope) {
        data = await this.migrateLegacyFolderDataToScopedStorage(session, version);
        if (!isCurrent()) return;
      }

      if (data && validateFolderData(data)) {
        this.data = data as FolderData;
        // Create primary backup on successful load
        session.backup.createPrimaryBackup(this.data);
        session.markReady();
      } else {
        // Don't immediately clear data - try to recover from backup
        console.warn(
          '[AIStudioFolderManager] Storage returned no data, attempting recovery from backup',
        );
        await this.attemptDataRecovery(null, session);
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.error('[AIStudioFolderManager] Load error:', error);
      // CRITICAL: Don't clear data on error - attempt recovery from backup
      await this.attemptDataRecovery(error, session);
    }
  }

  private async save(): Promise<boolean> {
    const session = this.dataSession;
    if (!session || !this.canEdit) return false;
    try {
      const snapshot = this.cloneFolderData(session.data);
      session.loadVersion += 1;
      session.markReady();
      session.backup.createEmergencyBackup(snapshot);
      if (session.saveInProgress) {
        session.pendingSave = snapshot;
        if (!session.pendingSaveCompletion) {
          let resolve!: (saved: boolean) => void;
          const promise = new Promise<boolean>((complete) => {
            resolve = complete;
          });
          session.pendingSaveCompletion = { promise, resolve };
        }
        return session.pendingSaveCompletion.promise;
      }
      session.activeSave = this.persistDataSession(session, snapshot);
      return session.activeSave;
    } catch (error) {
      console.error('[AIStudioFolderManager] Save error:', error);
      this.showErrorNotification('Failed to save folder data. Changes may not be persisted.');
      return false;
    }
  }

  /** Keep imported/synced drafts out of live data and recovery until storage accepts them. */
  private async replaceData(data: FolderData, prompts?: PromptItem[]): Promise<boolean> {
    const session = this.dataSession;
    const activation = this.accountScopeRequest;
    if (!session || !this.canEdit) return false;
    const snapshot = this.cloneFolderData(data);
    session.replacingData = true;
    session.loadVersion += 1;
    this.render();
    try {
      // Preserve accepted ordinary edits rather than coalescing a draft into their tail.
      const pending = session.pendingSaveCompletion?.promise ?? session.activeSave;
      if (pending) await pending;
      if (this.dataSession !== session || this.accountScopeRequest !== activation) return false;

      session.activeSave = this.persistDataSession(session, snapshot, prompts);
      const saved = await session.activeSave;
      // An issued write belongs to its session even after leaving and returning to that account.
      if (saved) session.data = snapshot;
      return saved;
    } finally {
      session.replacingData = false;
      if (this.dataSession === session) {
        this.render();
        if (this.container) this.applyHideArchivedToLibraryTable();
      } else if (!session.saveInProgress) {
        this.dataSessions.delete(session.storageKey);
      }
    }
  }

  private async persistDataSession(
    session: FolderDataSession,
    snapshot: FolderData,
    prompts?: PromptItem[],
  ): Promise<boolean> {
    this.dataSessions.set(session.storageKey, session);
    session.saveInProgress = true;
    let saved = false;
    try {
      // Save to chrome.storage.local using active scoped key.
      await chrome.storage.local.set({
        [session.storageKey]: snapshot,
        ...(prompts ? { gvPromptItems: prompts } : {}),
      });

      // Create primary backup AFTER successful save
      session.backup.createPrimaryBackup(snapshot);
      saved = true;
    } catch (error) {
      console.error('[AIStudioFolderManager] Save error:', error);
      // A newer queued snapshot can still persist this edit; report only a final failure.
      if (this.dataSession === session && !session.pendingSave) {
        this.showErrorNotification('Failed to save folder data. Changes may not be persisted.');
      }
    } finally {
      session.saveInProgress = false;
      const pending = session.pendingSave;
      const completion = session.pendingSaveCompletion;
      session.pendingSave = null;
      session.pendingSaveCompletion = null;
      if (pending) {
        session.activeSave = this.persistDataSession(session, pending);
        void session.activeSave.then((saved) => completion?.resolve(saved));
      } else {
        session.activeSave = null;
        if (this.dataSession !== session && !session.replacingData) {
          this.dataSessions.delete(session.storageKey);
        }
      }
    }
    // Folder membership drives which /library rows count as "archived"; re-sync the
    // table and nudge visibility after every mutation, not just on explicit user toggles.
    if (this.dataSession === session && !session.replacingData) {
      this.applyHideArchivedToLibraryTable();
      this.updateHideArchivedNudgeVisibility();
    }
    return saved;
  }

  private injectUI(): void {
    if (this.container && document.body.contains(this.container)) return;

    const container = document.createElement('div');
    // Scope aistudio-specific styles under .gv-aistudio to avoid impacting Gemini
    container.className = 'gv-folder-container gv-aistudio';

    const header = document.createElement('div');
    header.className = 'gv-folder-header';

    const title = document.createElement('div');
    title.className = 'gv-folder-title gds-label-l';
    title.textContent = this.t('folder_title');
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'gv-folder-header-actions';
    header.appendChild(actions);

    // For AI Studio, hide import/export for now to simplify UI

    // Cloud buttons (Skip on Safari as it doesn't support cloud sync yet)
    if (!isSafari()) {
      // Cloud upload button
      const cloudUploadButton = document.createElement('button');
      cloudUploadButton.className = 'gv-folder-action-btn';
      cloudUploadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H520q-33 0-56.5-23.5T440-240v-206l-64 62-56-56 160-160 160 160-56 56-64-62v206h220q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-83-58.5-141.5T480-720q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h100v80H260Zm220-280Z"/></svg>`;
      cloudUploadButton.title = this.t('folder_cloud_upload');
      cloudUploadButton.addEventListener('click', () => this.handleCloudUpload());
      // Add dynamic tooltip on mouseenter
      cloudUploadButton.addEventListener('mouseenter', async () => {
        const tooltip = await getCloudTooltip('upload', this.t);
        cloudUploadButton.title = tooltip;
      });
      actions.appendChild(cloudUploadButton);

      // Cloud sync button
      const cloudSyncButton = document.createElement('button');
      cloudSyncButton.className = 'gv-folder-action-btn';
      cloudSyncButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q17-72 85-137t145-65q33 0 56.5 23.5T520-716v242l64-62 56 56-160 160-160-160 56-56 64 62v-242q-76 14-118 73.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h480q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-48-22-89.5T600-680v-93q74 35 117 103.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H260Zm220-358Z"/></svg>`;
      cloudSyncButton.title = this.t('folder_cloud_sync');
      cloudSyncButton.addEventListener('click', () => this.handleCloudSync());
      // Add dynamic tooltip on mouseenter
      cloudSyncButton.addEventListener('mouseenter', async () => {
        const tooltip = await getCloudTooltip('sync', this.t);
        cloudSyncButton.title = tooltip;
      });
      actions.appendChild(cloudSyncButton);
    }

    // Add folder
    const addBtn = document.createElement('button');
    addBtn.className = 'gv-folder-add-btn';
    addBtn.title = this.t('folder_create');
    addBtn.appendChild(createIcon('add'));
    addBtn.addEventListener('click', () => this.folderTree.createFolder());
    actions.appendChild(addBtn);

    // On the V2 nav (no inline prompt history), surface a shortcut to /library.
    // We always create the button in V2 mode and toggle its visibility on route change,
    // since Angular won't re-run injectUI when the container survives a soft navigation.
    if (!this.historyRoot) {
      const libraryBtn = document.createElement('button');
      libraryBtn.className = 'gv-folder-action-btn gv-folder-library-btn';
      libraryBtn.title = this.t('folder_manage_in_library');
      libraryBtn.appendChild(createIcon('library_books'));
      libraryBtn.addEventListener('click', () => {
        try {
          location.assign('/library');
        } catch {}
      });
      actions.appendChild(libraryBtn);
      this.libraryShortcutBtn = libraryBtn;
      this.updateLibraryShortcutVisibility();
    } else {
      this.libraryShortcutBtn = null;
    }

    const list = document.createElement('div');
    list.className = 'gv-folder-list';
    container.appendChild(header);
    container.appendChild(list);

    // Insertion point: prefer the legacy prompt history anchor; otherwise drop the
    // panel inside the V2 left nav, right before the `.empty-space` spacer so the
    // panel sits just below the nav items while `.bottom-actions` stays pinned.
    const root = this.historyRoot;
    if (root) {
      const host: Element = root.parentElement ?? root;
      host.insertAdjacentElement('beforebegin', container);
    } else {
      const navContent = document.querySelector('.nav-content.v3-left-nav');
      const navEl = navContent?.querySelector(':scope > nav');
      const emptySpace = navEl?.querySelector(':scope > .empty-space');
      const bottomActions = navEl?.querySelector(':scope > .bottom-actions');
      if (emptySpace) {
        emptySpace.insertAdjacentElement('beforebegin', container);
      } else if (bottomActions) {
        bottomActions.insertAdjacentElement('beforebegin', container);
      } else if (navEl) {
        navEl.appendChild(container);
      } else if (navContent) {
        navContent.appendChild(container);
      } else {
        return;
      }
      container.classList.add('gv-aistudio-v2');
    }

    this.container = container;
    injectAIStudioFolderStyles();
    this.render();

    // Apply initial folder enabled setting
    this.applyFolderEnabledSetting();
  }

  private render(): void {
    if (!this.container) return;
    this.container.inert = !this.canEdit;
    this.container.setAttribute('aria-busy', String(!this.canEdit));
    this.container
      .querySelectorAll<HTMLButtonElement>('.gv-folder-header-actions button')
      .forEach((button) => {
        button.disabled = !this.canEdit;
      });
    const list = this.container.querySelector('.gv-folder-list') as HTMLElement | null;
    if (!list) return;
    this.folderTree.renderList(list);

    // After rendering, update active highlight
    this.highlightActiveConversation();

    // Keep the onboarding nudge in sync with the post-render folder state — e.g. the
    // user just archived their first conversation, so now we have a reason to show it.
    this.updateHideArchivedNudgeVisibility();
  }

  private getCurrentPromptIdFromLocation(): string | null {
    try {
      const m = (location.pathname || '').match(/\/prompts\/([^/?#]+)/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  private highlightActiveConversation(): void {
    if (!this.container) return;
    const currentId = this.getCurrentPromptIdFromLocation();
    const rows = this.container.querySelectorAll(
      '.gv-folder-conversation',
    ) as NodeListOf<HTMLElement>;
    rows.forEach((row) => {
      const isActive = currentId && row.dataset.conversationId === currentId;
      row.classList.toggle('gv-folder-conversation-selected', !!isActive);
    });
  }

  /**
   * Lazily attach the /library-only setup (table observer, drag bindings, floating
   * drop zone, hide-archived pass) when entering /library via SPA navigation. On
   * initial page load this is already run by initializeFolderUI; this method handles
   * the case where the user landed on /prompts first and later navigates to /library,
   * as well as Angular rebuilding the table on re-entry.
   */
  private ensureLibraryBindings(): void {
    if (!/\/library(\/|$)/.test(location.pathname)) return;
    this.observeLibraryTable();
    this.bindDraggablesInLibraryTable();
    this.injectLibraryDropZone();
    this.applyHideArchivedToLibraryTable();
  }

  /**
   * Toggle the V2 "Manage in Library" shortcut button based on the current path.
   * Hidden on /library itself (clicking would re-navigate to self).
   */
  private updateLibraryShortcutVisibility(): void {
    const btn = this.libraryShortcutBtn;
    if (!btn) return;
    const onLibrary = /\/library(\/|$)/.test(location.pathname);
    btn.style.display = onLibrary ? 'none' : '';
  }

  /**
   * Re-attach the folder panel if Angular tore it down between checks. Idempotent and
   * cheap when the panel is already mounted.
   */
  private ensureContainerMounted(): void {
    if (!this.folderEnabled) return;
    if (this.container && document.body.contains(this.container)) return;
    this.container = null;
    try {
      this.injectUI();
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to ensure folder panel mounted:', error);
    }
    // If the nav-content subtree was recreated, the previous MutationObserver lost its
    // target. Re-arm it against the current nav root so future detaches are detected.
    this.watchContainerMount();
  }

  private installRouteChangeListener(): void {
    this.stopRouteWatcher?.();
    const update = () =>
      setTimeout(() => {
        this.ensureContainerMounted();
        this.updateLibraryShortcutVisibility();
        if (!/\/library(\/|$)/.test(location.pathname)) {
          if (this.libraryMultiSelect.active) {
            this.libraryMultiSelect.exit();
          }
          // The /library table observer watches document.body; keep it disconnected
          // while away from /library so unrelated SPA mutations stay cheap. It is
          // recreated by ensureLibraryBindings() on re-entry.
          this.disconnectLibraryTableObserver();
        }
        this.ensureLibraryBindings();
        this.highlightActiveConversation();
      }, 0);
    this.stopRouteWatcher = watchRouteChanges(update);
  }

  private observePromptList(): void {
    const cleanup = this.promptListBinding.observePromptList();
    if (cleanup) this.cleanupFns.push(cleanup);
  }

  private observeBodyPromptPopovers(): void {
    this.promptListBinding.observeBodyPromptPopovers();
  }

  private async syncConversationTitlesFromPromptList(): Promise<void> {
    await this.promptListBinding.syncConversationTitles();
  }

  private bindDraggablesInPromptList(scope: ParentNode | null = this.historyRoot): void {
    this.promptListBinding.bindDraggablesInPromptList(scope);
  }

  private observeLibraryTable(): void {
    this.promptListBinding.observeLibraryTable();
  }

  private disconnectLibraryTableObserver(): void {
    this.promptListBinding.disconnectLibraryTableObserver();
  }

  private bindDraggablesInLibraryTable(): void {
    this.promptListBinding.bindDraggablesInLibraryTable();
  }

  /**
   * Inject a floating drop zone for the library page. Guarded so SPA navigations
   * into /library don't create duplicate floating cards.
   */
  private injectLibraryDropZone(): void {
    if (this.libraryDropZoneInjected) return;
    this.libraryDropZoneInjected = true;
    if (document.querySelector('.gv-library-drop-zone')) return;
    this.cleanupFns.push(
      mountLibraryDropZone({
        t: (key) => this.t(key),
        canEdit: () => this.canEdit,
        getData: () => this.data,
        save: () => this.save(),
        getScopeRequest: () => this.accountScopeRequest,
        showNotification: (message, level) => this.showNotification(message, level),
        uncategorizedKey: this.UNCATEGORIZED_KEY,
      }),
    );
  }

  private navigateToPrompt(promptId: string, url: string): void {
    // Prefer clicking the native link to preserve SPA behavior
    const selector = `ms-prompt-history-v3 a.prompt-link[href*="/prompts/${promptId}"]`;
    const a = document.querySelector(selector) as HTMLAnchorElement | null;
    if (a) {
      a.click();
      setTimeout(() => this.highlightActiveConversation(), 0);
      return;
    }
    try {
      window.history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
      setTimeout(() => this.highlightActiveConversation(), 0);
    } catch {
      location.href = url;
    }
  }

  private handleExport(): void {
    const payload = {
      format: 'gemini-voyager.folders.v1',
      exportedAt: new Date().toISOString(),
      data: this.data,
    };
    downloadJSON(payload, `gemini-voyager-folders-${this.timestamp()}.json`);
  }

  private handleImport(): void {
    const session = this.dataSession;
    const scopeRequest = this.accountScopeRequest;
    if (!session || !this.canEdit) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener(
      'change',
      async () => {
        const f = input.files && input.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          if (this.dataSession !== session || this.accountScopeRequest !== scopeRequest) return;
          const json = JSON.parse(text);
          const next = (json && (json.data || json)) as FolderData;
          if (!next || !Array.isArray(next.folders) || typeof next.folderContents !== 'object') {
            alert(this.t('folder_import_invalid_format'));
            return;
          }
          // Merge mode by default: simple union without duplicates
          const draft = mergeImportedFolderData(this.cloneFolderData(this.data), next);
          const saved = await this.replaceData(draft);
          if (this.dataSession !== session || this.accountScopeRequest !== scopeRequest) return;
          if (!saved) return;
          alert(this.t('folder_import_success'));
        } catch {
          if (this.dataSession !== session || this.accountScopeRequest !== scopeRequest) return;
          alert(this.t('folder_import_error'));
        }
      },
      { once: true },
    );
    input.click();
  }

  private timestamp(): string {
    return exportTimestamp();
  }

  private async loadFolderEnabledSetting(): Promise<void> {
    try {
      const result = await browser.storage.sync.get({ geminiFolderEnabled: true });
      this.folderEnabled = result.geminiFolderEnabled !== false;
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to load folder enabled setting:', error);
      this.folderEnabled = true;
    }
  }

  private async loadHideArchivedSettings(): Promise<void> {
    await this.hideArchived.load();
  }

  private updateHideArchivedNudgeVisibility(): void {
    this.hideArchived.updateNudgeVisibility();
  }

  private applyHideArchivedToLibraryTable(): void {
    this.hideArchived.applyToLibraryTable();
  }

  private setupStorageListener(): void {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync') {
        if (changes.geminiFolderEnabled) {
          this.folderEnabled = changes.geminiFolderEnabled.newValue !== false;
          this.applyFolderEnabledSetting();
        }
        if (
          changes[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] ||
          changes[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_AISTUDIO]
        ) {
          void (async () => {
            const nextEnabled = await accountIsolationService.isIsolationEnabled({
              platform: 'aistudio',
              pageUrl: window.location.href,
            });
            await this.handleAccountIsolationToggle(nextEnabled);
          })();
        }
        if (changes[SIDEBAR_WIDTH_KEY]) {
          this.sidebarWidth.applyStoredWidth(changes[SIDEBAR_WIDTH_KEY].newValue);
        }
        if (changes[StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS_AISTUDIO]) {
          this.hideArchived.applyStoredEnabled(
            changes[StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS_AISTUDIO].newValue,
          );
        }
        if (changes[StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO]) {
          this.hideArchived.applyStoredNudgeShown(
            changes[StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO].newValue,
          );
        }
      }
    });
  }

  private applyFolderEnabledSetting(): void {
    if (this.folderEnabled) {
      // Re-enabling after destroy(): restart the account-scope poller destroy() stopped.
      if (this.accountContextPoller === null) {
        this.setupAccountContextPoller();
      }
      // If folder UI doesn't exist yet, initialize it
      if (!this.container) {
        this.refreshAccountScope(true)
          .then(() => this.initializeFolderUI())
          .catch((error) => {
            console.error('[AIStudioFolderManager] Failed to initialize folder UI:', error);
          });
      } else {
        // UI already exists, just show it
        this.container.style.display = '';
      }
    } else {
      // Fully tear down injected DOM, observers, pollers and document listeners so a
      // disabled folder feature costs nothing. Re-enabling goes through
      // initializeFolderUI() again because destroy() resets this.container to null.
      this.destroy();
    }
  }

  /**
   * Tear down everything the folder feature attached to the page: injected DOM,
   * observers, pollers, timers and document/window listeners. Idempotent — safe to
   * call multiple times. The storage-change and runtime message listeners stay alive
   * so a later re-enable (folderEnabled -> true) can rebuild the UI from scratch via
   * initializeFolderUI().
   */
  private destroy(): void {
    this.dataSession?.deactivate();
    this.accountScopeRequest += 1;
    this.resolvingAccountContextFingerprint = null;
    const cleanups = this.cleanupFns.splice(0, this.cleanupFns.length);
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch {}
    }

    // Field-managed observers (registered outside cleanupFns to stay idempotent).
    try {
      this.containerMountObserver?.disconnect();
    } catch {}
    this.containerMountObserver = null;
    this.promptListBinding.destroy();

    // Pollers and debounce timers.
    if (this.accountContextPoller !== null) {
      clearInterval(this.accountContextPoller);
      this.accountContextPoller = null;
    }

    this.stopRouteWatcher?.();
    this.stopRouteWatcher = null;

    // Library multi-select state and any floating UI hosted on document.body.
    this.libraryMultiSelect.destroy();

    // Body-appended transient popovers we may have left open.
    try {
      document.querySelector('.gv-folder-confirm-dialog.gv-aistudio-confirm')?.remove();
    } catch {}
    try {
      document.querySelector('.gv-folder-menu.gv-aistudio-folder-menu')?.remove();
    } catch {}

    // Un-hide any /library rows we hid; with the feature off nothing would restore them.
    try {
      unhideArchivedRows();
    } catch {}

    // Injected DOM. Resetting container/flags lets initializeFolderUI() re-init cleanly.
    try {
      this.container?.remove();
    } catch {}
    this.container = null;
    this.libraryShortcutBtn = null;
    this.historyRoot = null;
    this.libraryDropZoneInjected = false;
    try {
      document.getElementById(AISTUDIO_FOLDER_STYLE_ID)?.remove();
    } catch {}
    try {
      document.documentElement.classList.remove('gv-aistudio-root');
    } catch {}
  }

  /**
   * Attempt to recover data when load() fails
   * Uses multi-layer backup system: primary > emergency > beforeUnload > in-memory
   */
  private async attemptDataRecovery(_error: unknown, session: FolderDataSession): Promise<void> {
    if (this.dataSession !== session) return;
    console.warn('[AIStudioFolderManager] Attempting data recovery after load failure');

    // Step 1: Try to restore from localStorage backups (primary, emergency, beforeUnload)
    const recovered = session.backup.recoverFromBackup();
    if (recovered && validateFolderData(recovered)) {
      this.data = recovered;
      session.markReady();
      console.warn('[AIStudioFolderManager] Data recovered from localStorage backup');
      this.showNotification('Folder data recovered from backup', 'warning');
      // Try to save recovered data to persistent storage
      await this.save();
      return;
    }

    // Step 2: Keep existing in-memory data if it exists and is valid
    if (validateFolderData(this.data) && this.data.folders.length > 0) {
      session.markReady();
      console.warn('[AIStudioFolderManager] Keeping existing in-memory data after load error');
      this.showErrorNotification('Failed to load folder data, using cached version');
      return;
    }

    // Step 3: Last resort - initialize empty data and notify user
    console.error('[AIStudioFolderManager] All recovery attempts failed, initializing empty data');
    this.data = { folders: [], folderContents: {} };
    session.markReady();
    this.showErrorNotification('Failed to load folder data. All folders have been reset.');
  }

  /**
   * Show an error notification to the user
   * @deprecated Use showNotification() instead for better level support
   */
  private showErrorNotification(message: string): void {
    this.showNotification(message, 'error');
  }

  /**
   * Show a notification to the user with customizable level
   */
  private showNotification(message: string, level: 'info' | 'warning' | 'error' = 'error'): void {
    try {
      const notification = document.createElement('div');
      notification.className = `gv-notification gv-notification-${level}`;
      notification.textContent = `[Gemini Voyager] ${message}`;

      // Color based on level
      const colors = {
        info: '#2196F3',
        warning: '#FF9800',
        error: '#f44336',
      };

      // Apply inline styles for visibility
      const style = notification.style;
      style.position = 'fixed';
      style.top = '20px';
      style.right = '20px';
      style.padding = '12px 20px';
      style.background = colors[level];
      style.color = 'white';
      style.borderRadius = '4px';
      style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      style.zIndex = String(2147483647);
      style.maxWidth = '400px';
      style.fontSize = '14px';
      style.fontFamily = 'system-ui, -apple-system, sans-serif';
      style.lineHeight = '1.4';

      document.body.appendChild(notification);

      // Auto-remove after timeout (longer for errors/warnings)
      const timeout =
        level === 'info' ? 3000 : level === 'warning' ? 7000 : NOTIFICATION_TIMEOUT_MS;
      setTimeout(() => {
        try {
          document.body.removeChild(notification);
        } catch {
          // Element might already be removed
        }
      }, timeout);
    } catch (notificationError) {
      console.error('[AIStudioFolderManager] Failed to show notification:', notificationError);
    }
  }

  /**
   * Check if extension context is valid
   */
  private isExtensionContextValid(): boolean {
    try {
      // Try to access chrome.runtime.id to check if context is valid
      return !!(browser?.runtime?.id || chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  /**
   * Handle cloud upload - upload folder data and prompts to Google Drive
   * This mirrors the logic in CloudSyncSettings.tsx handleSyncNow()
   * Note: AI Studio uses its own folder file but shares prompts with Gemini
   */
  private async handleCloudUpload(): Promise<void> {
    const session = this.dataSession;
    const scopeRequest = this.accountScopeRequest;
    if (!session || !this.canEdit) return;
    const accountScope = this.toSyncAccountScope(session.accountScope);
    try {
      this.showNotification(this.t('uploadInProgress'), 'info');

      // Get current folder data
      const folders = this.cloneFolderData(session.data);

      // Get prompts from storage (shared with Gemini)
      let prompts: PromptItem[] = [];
      try {
        const storageResult = await chrome.storage.local.get(['gvPromptItems']);
        if (storageResult.gvPromptItems) {
          prompts = storageResult.gvPromptItems as PromptItem[];
        }
      } catch (err) {
        console.warn('[AIStudioFolderManager] Could not get prompts for upload:', err);
      }
      if (this.dataSession !== session || this.accountScopeRequest !== scopeRequest) return;

      console.log(
        `[AIStudioFolderManager] Uploading - folders: ${folders.folders?.length || 0}, prompts: ${prompts.length}`,
      );

      // Send upload request to background script
      const response = (await browser.runtime.sendMessage({
        type: 'gv.sync.upload',
        payload: {
          folders,
          prompts,
          platform: 'aistudio',
          accountScope,
        },
      })) as { ok?: boolean; error?: string } | undefined;

      if (this.dataSession !== session || this.accountScopeRequest !== scopeRequest) return;
      if (response?.ok) {
        this.showNotification(this.t('uploadSuccess'), 'info');
      } else {
        const errorMsg = response?.error || 'Unknown error';
        this.showNotification(this.t('syncError').replace('{error}', errorMsg), 'error');
      }
    } catch (error) {
      if (this.dataSession !== session || this.accountScopeRequest !== scopeRequest) return;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AIStudioFolderManager] Cloud upload failed:', error);
      this.showNotification(this.t('syncError').replace('{error}', errorMsg), 'error');
    }
  }

  /**
   * Handle cloud sync - download and merge folder data and prompts from Google Drive
   * This mirrors the logic in CloudSyncSettings.tsx handleDownloadFromDrive()
   * Note: AI Studio uses its own folder file but shares prompts with Gemini
   */
  private async handleCloudSync(): Promise<void> {
    const session = this.dataSession;
    const scopeRequest = this.accountScopeRequest;
    if (!session || !this.canEdit) return;
    const accountScope = this.toSyncAccountScope(session.accountScope);
    try {
      this.showNotification(this.t('downloadInProgress'), 'info');

      // Send download request to background script
      const response = (await browser.runtime.sendMessage({
        type: 'gv.sync.download',
        payload: {
          platform: 'aistudio',
          accountScope,
        },
      })) as
        | {
            ok?: boolean;
            error?: string;
            data?: {
              folders?: { data?: FolderData };
              prompts?: { items?: PromptItem[] };
            };
          }
        | undefined;

      if (this.dataSession !== session || this.accountScopeRequest !== scopeRequest) return;
      if (!response?.ok) {
        const errorMsg = response?.error || 'Download failed';
        this.showNotification(this.t('syncError').replace('{error}', errorMsg), 'error');
        return;
      }

      if (!response.data) {
        this.showNotification(this.t('syncNoData'), 'info');
        return;
      }

      // Extract cloud data
      const cloudFoldersPayload = response.data?.folders;
      const cloudPromptsPayload = response.data?.prompts;
      const cloudFolderData = cloudFoldersPayload?.data || { folders: [], folderContents: {} };
      const cloudPromptItems = cloudPromptsPayload?.items || [];

      console.log(
        `[AIStudioFolderManager] Downloaded - folders: ${cloudFolderData.folders?.length || 0}, prompts: ${cloudPromptItems.length}`,
      );

      // Get local prompts for merge (shared with Gemini)
      let localPrompts: PromptItem[] = [];
      try {
        const storageResult = await chrome.storage.local.get(['gvPromptItems']);
        if (storageResult.gvPromptItems) {
          localPrompts = storageResult.gvPromptItems as PromptItem[];
        }
      } catch (err) {
        console.warn('[AIStudioFolderManager] Could not get local prompts for merge:', err);
      }
      if (this.dataSession !== session || this.accountScopeRequest !== scopeRequest) return;

      // Merge folder data
      const localFolders = this.data;
      const mergedFolders = mergeSyncedFolderData(localFolders, cloudFolderData);

      // Merge prompts (simple ID-based merge)
      const mergedPrompts = this.mergePromptsData(localPrompts, cloudPromptItems);

      console.log(
        `[AIStudioFolderManager] Merged - folders: ${mergedFolders.folders?.length || 0}, prompts: ${mergedPrompts.length}`,
      );

      // Persist folders and shared prompts together before publishing the merged folders.
      const saved = await this.replaceData(mergedFolders, mergedPrompts);
      if (this.dataSession !== session || this.accountScopeRequest !== scopeRequest) return;
      if (!saved) return;

      this.showNotification(this.t('downloadMergeSuccess'), 'info');
    } catch (error) {
      if (this.dataSession !== session || this.accountScopeRequest !== scopeRequest) return;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AIStudioFolderManager] Cloud sync failed:', error);
      this.showNotification(this.t('syncError').replace('{error}', errorMsg), 'error');
    }
  }

  /**
   * Merge prompts through the shared sync policy so legacy cloud records
   * cannot erase names that exist only in local storage.
   */
  private mergePromptsData(local: PromptItem[], cloud: PromptItem[]): PromptItem[] {
    return mergeSyncedPrompts(local, cloud);
  }
}

export async function startAIStudioFolderManager(): Promise<void> {
  try {
    const mgr = new AIStudioFolderManager();
    await mgr.init();
  } catch (e) {
    console.error('[AIStudioFolderManager] Start error:', e);
  }
}
