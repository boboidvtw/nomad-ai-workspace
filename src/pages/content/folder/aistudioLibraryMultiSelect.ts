/**
 * Multi-select and batch delete on the AI Studio /library table: long-press a row to
 * start, click rows to toggle, delete through each row's native "More options" menu.
 */
import { buildLibraryPromptData, getLibraryPromptRows } from './aistudioPromptLinks';
import { normalizeText } from './aistudioUtils';

export const MAX_LIBRARY_BATCH_DELETE_COUNT = 50;
const LIBRARY_LONG_PRESS_MS = 500;
const LIBRARY_BATCH_DELETE_CONFIG = {
  DELAY_BETWEEN_DELETIONS: 500,
  MENU_APPEAR_DELAY: 300,
  DIALOG_APPEAR_DELAY: 300,
  DELETION_COMPLETE_DELAY: 500,
  MAX_BUTTON_WAIT_TIME: 3000,
  BUTTON_CHECK_INTERVAL: 100,
  PAGE_REFRESH_DELAY: 1500,
} as const;

export interface LibraryMultiSelectOptions {
  t: (key: string) => string;
  showNotification: (message: string, level: 'info' | 'warning' | 'error') => void;
  createIcon: (name: string) => HTMLElement;
}

/** The localized delete-menu labels, split on ASCII and CJK list separators. */
export function parseDeleteKeywords(raw: string): string[] {
  return (raw || '')
    .split(/[,，、；;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function isVisibleElement(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    el.offsetParent !== null
  );
}

function clickBackdropToCloseMenu(): void {
  document.querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AIStudioLibraryMultiSelect {
  private readonly selected = new Set<string>();
  private multiSelectMode = false;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;
  private hostElement: HTMLElement | null = null;
  private batchDeleteInProgress = false;
  private progressElement: HTMLElement | null = null;

  constructor(private readonly options: LibraryMultiSelectOptions) {}

  get active(): boolean {
    return this.multiSelectMode;
  }

  /** Leave multi-select mode and remove everything this class put on document.body. */
  destroy(): void {
    if (this.multiSelectMode) this.exit();
    this.removeOutsideClickHandler();
    try {
      this.hostElement?.remove();
    } catch {}
    this.hostElement = null;
    this.hideProgress();
  }

  bindRow(row: HTMLElement): void {
    if ((row as Element & { _gvLibraryMultiSelectBound?: boolean })._gvLibraryMultiSelectBound)
      return;
    (row as Element & { _gvLibraryMultiSelectBound?: boolean })._gvLibraryMultiSelectBound = true;

    let longPressTriggered = false;
    let longPressTimeoutId: number | null = null;

    const clearLongPress = () => {
      if (longPressTimeoutId === null) return;
      clearTimeout(longPressTimeoutId);
      longPressTimeoutId = null;
    };

    row.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('button, [role="button"]')) {
        return;
      }
      const data = buildLibraryPromptData(row);
      if (!data) return;
      longPressTriggered = false;
      clearLongPress();
      longPressTimeoutId = window.setTimeout(() => {
        longPressTriggered = true;
        this.enter(data.conversationId);
      }, LIBRARY_LONG_PRESS_MS);
    });

    row.addEventListener('mouseup', clearLongPress);
    row.addEventListener('mouseleave', clearLongPress);

    row.addEventListener(
      'click',
      (event) => {
        if (event.target instanceof Element && event.target.closest('button, [role="button"]')) {
          return;
        }
        if (this.batchDeleteInProgress) return;

        if (longPressTriggered) {
          event.preventDefault();
          event.stopPropagation();
          longPressTriggered = false;
          return;
        }

        if (!this.multiSelectMode) return;

        const data = buildLibraryPromptData(row);
        if (!data) return;
        event.preventDefault();
        event.stopPropagation();
        this.toggle(data.conversationId);
      },
      true,
    );
  }

  enter(initialConversationId: string): void {
    this.multiSelectMode = true;
    this.selected.add(initialConversationId);
    this.updateUI();
    this.setupOutsideClickHandler();
  }

  exit(): void {
    this.multiSelectMode = false;
    this.removeOutsideClickHandler();
    this.selected.clear();
    this.updateUI();
  }

  toggle(conversationId: string): void {
    if (this.selected.has(conversationId)) {
      this.selected.delete(conversationId);
      if (this.selected.size === 0) {
        this.exit();
        return;
      }
    } else {
      if (this.selected.size >= MAX_LIBRARY_BATCH_DELETE_COUNT) {
        this.options.showNotification(
          this.options
            .t('batch_delete_limit_reached')
            .replace('{max}', String(MAX_LIBRARY_BATCH_DELETE_COUNT)),
          'info',
        );
        return;
      }
      this.selected.add(conversationId);
    }
    this.updateUI();
  }

  updateUI(): void {
    getLibraryPromptRows().forEach((row) => {
      const data = buildLibraryPromptData(row);
      row.classList.toggle(
        'gv-library-row-selected',
        !!data && this.selected.has(data.conversationId),
      );
    });

    const host = this.multiSelectMode ? this.getHost() : this.getExistingHost();
    if (!host) return;

    host.classList.toggle('gv-multi-select-mode', this.multiSelectMode);

    const count = host.querySelector('[data-selection-count="true"]');
    if (count) {
      count.textContent = this.options
        .t('folder_multi_select_count')
        .replace('{count}', String(this.selected.size));
    }

    const actions = host.querySelector('[data-multi-select-actions="true"]');
    if (!actions) return;
    if (!this.multiSelectMode) {
      if (actions.childElementCount > 0) actions.innerHTML = '';
      return;
    }
    if (actions.childElementCount > 0) return;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'gv-multi-select-action-btn gv-multi-select-delete-btn';
    deleteBtn.title = this.options.t('batch_delete_button');
    deleteBtn.appendChild(this.options.createIcon('delete'));
    deleteBtn.addEventListener('click', () => void this.batchDelete());
    actions.appendChild(deleteBtn);

    const exitBtn = document.createElement('button');
    exitBtn.className = 'gv-multi-select-action-btn gv-multi-select-exit-btn';
    exitBtn.title = this.options.t('folder_multi_select_exit');
    exitBtn.appendChild(this.options.createIcon('close'));
    exitBtn.addEventListener('click', () => this.exit());
    actions.appendChild(exitBtn);
  }

  private createIndicator(): HTMLElement {
    const indicator = document.createElement('div');
    indicator.className = 'gv-multi-select-indicator';

    const content = document.createElement('div');
    content.className = 'gv-multi-select-indicator-content';
    content.appendChild(this.options.createIcon('check_circle'));

    const text = document.createElement('span');
    text.className = 'gv-multi-select-indicator-text';
    text.dataset.selectionCount = 'true';
    text.textContent = this.options.t('folder_multi_select_count').replace('{count}', '0');
    content.appendChild(text);
    indicator.appendChild(content);

    const actions = document.createElement('div');
    actions.className = 'gv-multi-select-actions';
    actions.dataset.multiSelectActions = 'true';
    indicator.appendChild(actions);

    return indicator;
  }

  private getHost(): HTMLElement {
    if (!this.hostElement?.isConnected) {
      const host = document.createElement('div');
      host.className =
        'gv-folder-container gv-multi-select-floating-host gv-aistudio-library-select';
      host.dataset.multiSelectFloatingHost = 'true';
      host.style.position = 'fixed';
      host.style.top = '72px';
      host.style.right = '24px';
      host.style.width = 'min(360px, calc(100vw - 48px))';
      host.style.zIndex = String(2147483647);
      host.appendChild(this.createIndicator());
      document.body.appendChild(host);
      this.hostElement = host;
    }
    return this.hostElement;
  }

  private getExistingHost(): HTMLElement | null {
    return this.hostElement?.isConnected ? this.hostElement : null;
  }

  private setupOutsideClickHandler(): void {
    this.removeOutsideClickHandler();
    this.outsideClickHandler = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (this.hostElement?.contains(target)) return;
      if ((target as Element).closest?.('.cdk-overlay-container, .mat-mdc-dialog-container'))
        return;
      if (getLibraryPromptRows().some((row) => row.contains(target))) return;
      this.exit();
    };
    setTimeout(() => {
      document.addEventListener('click', this.outsideClickHandler!, true);
    }, 0);
  }

  private removeOutsideClickHandler(): void {
    if (!this.outsideClickHandler) return;
    document.removeEventListener('click', this.outsideClickHandler, true);
    this.outsideClickHandler = null;
  }

  private async batchDelete(): Promise<void> {
    if (this.batchDeleteInProgress) return;
    const conversationIds = Array.from(this.selected);
    if (conversationIds.length === 0) return;

    const confirmed = confirm(
      this.options.t('batch_delete_confirm').replace('{count}', String(conversationIds.length)),
    );
    if (!confirmed) return;

    this.batchDeleteInProgress = true;
    let successCount = 0;
    let failedCount = 0;

    try {
      this.showProgress(0, conversationIds.length);
      for (let i = 0; i < conversationIds.length; i++) {
        this.updateProgress(i + 1, conversationIds.length);
        const success = await this.triggerDeleteForPrompt(conversationIds[i]);
        if (success) successCount++;
        else failedCount++;
        if (i < conversationIds.length - 1) {
          await delay(LIBRARY_BATCH_DELETE_CONFIG.DELAY_BETWEEN_DELETIONS);
        }
      }
    } finally {
      this.batchDeleteInProgress = false;
      this.hideProgress();
    }

    if (failedCount === 0) {
      this.options.showNotification(
        this.options.t('batch_delete_success').replace('{count}', String(successCount)),
        'info',
      );
    } else {
      this.options.showNotification(
        this.options
          .t('batch_delete_partial')
          .replace('{success}', String(successCount))
          .replace('{failed}', String(failedCount)),
        'warning',
      );
    }

    this.exit();
    if (successCount > 0) {
      setTimeout(() => location.reload(), LIBRARY_BATCH_DELETE_CONFIG.PAGE_REFRESH_DELAY);
    }
  }

  private async triggerDeleteForPrompt(conversationId: string): Promise<boolean> {
    const row = this.findRow(conversationId);
    if (!row) return false;
    const moreButton = row.querySelector<HTMLElement>(
      'button[aria-label="More options"], button[aria-label*="More"], button.ms-button-icon',
    );
    if (!moreButton) return false;

    moreButton.click();
    await delay(LIBRARY_BATCH_DELETE_CONFIG.MENU_APPEAR_DELAY);
    const deleteClicked = await this.waitForDeleteButtonAndClick();
    if (!deleteClicked) {
      clickBackdropToCloseMenu();
      return false;
    }

    await delay(LIBRARY_BATCH_DELETE_CONFIG.DIALOG_APPEAR_DELAY);
    await this.confirmDeleteIfNeeded();
    await delay(LIBRARY_BATCH_DELETE_CONFIG.DELETION_COMPLETE_DELAY);
    return true;
  }

  private findRow(conversationId: string): HTMLElement | null {
    for (const row of getLibraryPromptRows()) {
      const data = buildLibraryPromptData(row);
      if (data?.conversationId === conversationId) return row;
    }
    return null;
  }

  private async waitForDeleteButtonAndClick(): Promise<boolean> {
    const maxWaitTime = LIBRARY_BATCH_DELETE_CONFIG.MAX_BUTTON_WAIT_TIME;
    const checkInterval = LIBRARY_BATCH_DELETE_CONFIG.BUTTON_CHECK_INTERVAL;
    const keywords = parseDeleteKeywords(this.options.t('batch_delete_match_patterns'));
    let elapsed = 0;

    while (elapsed < maxWaitTime) {
      const byTestId = Array.from(
        document.querySelectorAll<HTMLElement>('[data-test-id="delete-button"]'),
      ).find((el) => isVisibleElement(el));
      if (byTestId) {
        byTestId.click();
        return true;
      }

      const menuItems = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.cdk-overlay-container button[role="menuitem"], .cdk-overlay-container [role="menuitem"], .mat-mdc-menu-content button',
        ),
      );
      for (const item of menuItems) {
        if (!isVisibleElement(item)) continue;
        const text = normalizeText(item.textContent).toLowerCase();
        if (
          keywords.some(
            (keyword) => text === keyword || (text.includes(keyword) && text.length < 20),
          )
        ) {
          item.click();
          return true;
        }
      }

      const deleteIcon = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.cdk-overlay-container mat-icon, .cdk-overlay-container .material-icons, .cdk-overlay-container .google-symbols',
        ),
      ).find((icon) => {
        const text = normalizeText(icon.textContent).toLowerCase();
        const fontIcon = normalizeText(icon.getAttribute('fonticon')).toLowerCase();
        return ['delete', 'delete_forever', 'delete_outline'].includes(text || fontIcon);
      });
      const iconButton = deleteIcon?.closest('button, [role="menuitem"]') as HTMLElement | null;
      if (iconButton && isVisibleElement(iconButton)) {
        iconButton.click();
        return true;
      }

      await delay(checkInterval);
      elapsed += checkInterval;
    }

    return false;
  }

  private async confirmDeleteIfNeeded(): Promise<void> {
    const maxWaitTime = LIBRARY_BATCH_DELETE_CONFIG.MAX_BUTTON_WAIT_TIME;
    const checkInterval = LIBRARY_BATCH_DELETE_CONFIG.BUTTON_CHECK_INTERVAL;
    const keywords = parseDeleteKeywords(this.options.t('batch_delete_match_patterns'));
    let elapsed = 0;

    while (elapsed < maxWaitTime) {
      const confirmByTestId = document.querySelector<HTMLElement>(
        '[data-test-id*="confirm"], [data-test-id*="delete"]:not([data-test-id="delete-button"])',
      );
      if (confirmByTestId && isVisibleElement(confirmByTestId)) {
        confirmByTestId.click();
        return;
      }

      const buttons = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.cdk-overlay-container button, .mat-mdc-dialog-container button',
        ),
      ).filter((button) => isVisibleElement(button));
      for (const button of buttons) {
        const text = normalizeText(button.textContent).toLowerCase();
        if (keywords.some((keyword) => text === keyword || text.includes(keyword))) {
          button.click();
          return;
        }
      }

      const actions = document.querySelector('.mat-mdc-dialog-actions, .mat-dialog-actions');
      const actionButtons = actions?.querySelectorAll<HTMLElement>('button');
      if (actionButtons && actionButtons.length >= 2) {
        const last = actionButtons[actionButtons.length - 1];
        if (isVisibleElement(last)) {
          last.click();
          return;
        }
      }

      await delay(checkInterval);
      elapsed += checkInterval;
    }
  }

  private showProgress(current: number, total: number): void {
    this.hideProgress();

    const progress = document.createElement('div');
    progress.className = 'gv-batch-delete-progress';
    progress.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(32, 33, 36, 0.95);
      color: #e8eaed;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-size: 14px;
    `;

    const text = document.createElement('span');
    text.className = 'gv-batch-delete-progress-text';
    text.textContent = this.options
      .t('batch_delete_in_progress')
      .replace('{current}', String(current))
      .replace('{total}', String(total));
    progress.appendChild(text);
    document.body.appendChild(progress);
    this.progressElement = progress;
  }

  private updateProgress(current: number, total: number): void {
    const text = this.progressElement?.querySelector('.gv-batch-delete-progress-text');
    if (!text) return;
    text.textContent = this.options
      .t('batch_delete_in_progress')
      .replace('{current}', String(current))
      .replace('{total}', String(total));
  }

  private hideProgress(): void {
    this.progressElement?.remove();
    this.progressElement = null;
  }
}
