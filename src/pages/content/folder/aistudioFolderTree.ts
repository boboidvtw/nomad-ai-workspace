/**
 * The AI Studio sidebar folder tree: rendering folders (two levels) and their
 * conversations, the folder menu, inline create/rename editors, delete/remove
 * confirmations and drop targets. Edits build new folder data and hand it back
 * through `setData` before saving.
 */
import { parseDragDataFromEvent } from './aistudioPromptLinks';
import { normalizeText, now, uid } from './aistudioUtils';
import type { ConversationReference, DragData, Folder, FolderData } from './types';

type InlineFolderEditor = {
  wrapper: HTMLElement;
  input: HTMLInputElement;
  saveBtn: HTMLButtonElement;
  cancelBtn: HTMLButtonElement;
};

type FolderFlag = 'isExpanded' | 'pinned';

export interface FolderTreeOptions {
  t: (key: string) => string;
  getContainer: () => HTMLElement | null;
  getData: () => FolderData;
  setData: (data: FolderData) => void;
  canEdit: () => boolean;
  save: () => Promise<boolean>;
  /** Re-renders the whole panel (the manager also refreshes highlights and the nudge). */
  render: () => void;
  navigateToPrompt: (promptId: string, url: string) => void;
  uncategorizedKey: string;
}

export function addFolder(data: FolderData, folder: Folder): FolderData {
  return {
    ...data,
    folders: [...data.folders, folder],
    folderContents: { ...data.folderContents, [folder.id]: [] },
  };
}

export function renameFolderInData(
  data: FolderData,
  folderId: string,
  name: string,
  timestamp: number,
): FolderData {
  return {
    ...data,
    folders: data.folders.map((f) =>
      f.id === folderId ? { ...f, name, updatedAt: timestamp } : f,
    ),
  };
}

/** Remove a folder, its direct subfolders and their conversations. */
export function deleteFolderTree(data: FolderData, folderId: string): FolderData {
  const doomed = new Set([
    folderId,
    ...data.folders.filter((f) => f.parentId === folderId).map((f) => f.id),
  ]);
  return {
    ...data,
    folders: data.folders.filter((f) => !doomed.has(f.id)),
    folderContents: Object.fromEntries(
      Object.entries(data.folderContents).filter(([id]) => !doomed.has(id)),
    ),
  };
}

export function toggleFolderFlag(data: FolderData, folderId: string, flag: FolderFlag): FolderData {
  return {
    ...data,
    folders: data.folders.map((f) => (f.id === folderId ? { ...f, [flag]: !f[flag] } : f)),
  };
}

function mapFolderConversations(
  data: FolderData,
  folderId: string,
  update: (conversations: ConversationReference[]) => ConversationReference[],
): FolderData {
  return {
    ...data,
    folderContents: {
      ...data.folderContents,
      [folderId]: update(data.folderContents[folderId] || []),
    },
  };
}

export function toggleConversationStar(
  data: FolderData,
  folderId: string,
  conversationId: string,
): FolderData {
  return mapFolderConversations(data, folderId, (conversations) =>
    conversations.map((c) =>
      c.conversationId === conversationId ? { ...c, starred: !c.starred } : c,
    ),
  );
}

export function removeConversationFromData(
  data: FolderData,
  folderId: string,
  conversationId: string,
): FolderData {
  return mapFolderConversations(data, folderId, (conversations) =>
    conversations.filter((c) => c.conversationId !== conversationId),
  );
}

/**
 * File a conversation into `targetFolderId` and out of every other folder. A null
 * target (or the uncategorized key) files it as uncategorized; an existing
 * uncategorized entry is kept rather than replaced.
 */
export function moveConversationToFolder(
  data: FolderData,
  conversation: ConversationReference,
  targetFolderId: string | null,
  uncategorizedKey: string,
): FolderData {
  const target = targetFolderId || uncategorizedKey;
  const folderContents: FolderData['folderContents'] = {};
  for (const [folderId, conversations] of Object.entries(data.folderContents)) {
    folderContents[folderId] =
      folderId === target
        ? conversations
        : (conversations || []).filter((c) => c.conversationId !== conversation.conversationId);
  }
  const existing = folderContents[target] || [];
  if (!existing.some((c) => c.conversationId === conversation.conversationId)) {
    folderContents[target] = [...existing, conversation];
  }
  return { ...data, folderContents };
}

/** Pinned folders first, then by creation time. */
function sortFolders(folders: Folder[]): Folder[] {
  return [...folders].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return a.createdAt - b.createdAt;
  });
}

// Helper to create a ligature icon span with a data-icon attribute
export function createIcon(name: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'google-symbols';
  try {
    span.dataset.icon = name;
  } catch {}
  span.textContent = name;
  return span;
}

function createInlineMaterialIcon(name: string): HTMLElement {
  const icon = document.createElement('mat-icon');
  icon.setAttribute('role', 'img');
  icon.setAttribute('aria-hidden', 'true');
  icon.className = 'mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color';
  icon.textContent = name;
  return icon;
}

function createMenuItem(
  label: string,
  iconName: string,
  action: () => void,
  options: { danger?: boolean } = {},
): HTMLButtonElement {
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `gv-folder-menu-item${options.danger ? ' gv-folder-menu-item-danger' : ''}`;
  item.appendChild(createInlineMaterialIcon(iconName));
  item.append(document.createTextNode(label));
  item.addEventListener('click', action);
  return item;
}

function createInlineFolderEditor(
  t: (key: string) => string,
  wrapperTag: 'div' | 'span',
  wrapperClassName: string,
  inputClassName: string,
  inputOptions: { placeholder?: string; value?: string } = {},
): InlineFolderEditor {
  const wrapper = document.createElement(wrapperTag);
  wrapper.className = wrapperClassName;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = inputClassName;
  input.maxLength = 50;
  if (inputOptions.placeholder) input.placeholder = inputOptions.placeholder;
  if (inputOptions.value) input.value = inputOptions.value;

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'gv-folder-inline-btn gv-folder-inline-save';
  saveBtn.title = t('pm_save');
  saveBtn.appendChild(createInlineMaterialIcon('check'));

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'gv-folder-inline-btn gv-folder-inline-cancel';
  cancelBtn.title = t('pm_cancel');
  cancelBtn.appendChild(createInlineMaterialIcon('close'));

  wrapper.appendChild(input);
  wrapper.appendChild(saveBtn);
  wrapper.appendChild(cancelBtn);

  return { wrapper, input, saveBtn, cancelBtn };
}

function showFolderConfirm(
  t: (key: string) => string,
  anchor: HTMLElement | null | undefined,
  message: string,
  actionLabel: string,
  onConfirm: () => void,
  alignRight = false,
): void {
  document.querySelector('.gv-folder-confirm-dialog.gv-aistudio-confirm')?.remove();

  const dialog = document.createElement('div');
  dialog.className = 'gv-folder-confirm-dialog gv-aistudio-confirm';

  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    dialog.style.position = 'fixed';
    dialog.style.top = `${rect.bottom + 4}px`;
    dialog.style.left = `${Math.max(10, alignRight ? rect.right - 200 : rect.left + 24)}px`;
    dialog.style.zIndex = '2147483647';
  }

  const msg = document.createElement('div');
  msg.className = 'gv-confirm-message';
  msg.textContent = message;
  dialog.appendChild(msg);

  const actions = document.createElement('div');
  actions.className = 'gv-confirm-actions';

  const confirmBtn = document.createElement('button');
  confirmBtn.type = 'button';
  confirmBtn.className = 'gv-confirm-btn gv-confirm-delete';
  confirmBtn.textContent = actionLabel;

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'gv-confirm-btn gv-confirm-cancel';
  cancelBtn.textContent = t('pm_cancel');

  let closeOnOutside: ((e: MouseEvent) => void) | null = null;
  const cleanup = () => {
    if (closeOnOutside) {
      document.removeEventListener('click', closeOnOutside);
      closeOnOutside = null;
    }
    dialog.remove();
  };

  confirmBtn.addEventListener('click', () => {
    onConfirm();
    cleanup();
  });
  cancelBtn.addEventListener('click', cleanup);

  actions.appendChild(confirmBtn);
  actions.appendChild(cancelBtn);
  dialog.appendChild(actions);
  document.body.appendChild(dialog);

  setTimeout(() => {
    if (!dialog.isConnected) return;
    closeOnOutside = (e: MouseEvent) => {
      if (!dialog.contains(e.target as Node)) cleanup();
    };
    document.addEventListener('click', closeOnOutside);
  }, 0);
}

export class AIStudioFolderTree {
  constructor(private readonly options: FolderTreeOptions) {}

  /** Fill the folder list: root folders, the root drop zone and uncategorized rows. */
  renderList(list: HTMLElement): void {
    const { t, getData, uncategorizedKey } = this.options;
    list.innerHTML = '';

    // Render only root-level folders here; children are rendered recursively
    for (const f of sortFolders(getData().folders.filter((f) => !f.parentId))) {
      list.appendChild(this.renderFolder(f));
    }

    // Root drop zone
    const rootDrop = document.createElement('div');
    rootDrop.className = 'gv-folder-root-drop';
    rootDrop.textContent = '';
    this.bindDropZone(rootDrop, null);
    list.appendChild(rootDrop);

    // Render uncategorized conversations (dropped to root)
    const uncategorized = getData().folderContents[uncategorizedKey] || [];
    if (uncategorized.length > 0) {
      const uncatSection = document.createElement('div');
      uncatSection.className = 'gv-folder-uncategorized';

      const uncatHeader = document.createElement('div');
      uncatHeader.className = 'gv-folder-uncategorized-header';
      uncatHeader.innerHTML = `<span class="google-symbols" data-icon="inbox" style="margin-right: 6px;">inbox</span>${t('folder_uncategorized')}`;
      uncatSection.appendChild(uncatHeader);

      const uncatContent = document.createElement('div');
      uncatContent.className = 'gv-folder-uncategorized-content';
      for (const conv of uncategorized) {
        uncatContent.appendChild(this.renderConversation(uncategorizedKey, conv));
      }
      uncatSection.appendChild(uncatContent);
      list.appendChild(uncatSection);
    }
  }

  renderFolder(folder: Folder, level: number = 0): HTMLElement {
    const { t } = this.options;
    const item = document.createElement('div');
    item.className = 'gv-folder-item';
    item.dataset.folderId = folder.id;
    item.dataset.pinned = folder.pinned ? 'true' : 'false';
    item.dataset.level = String(level);

    const header = document.createElement('div');
    header.className = 'gv-folder-item-header';
    // Add left padding for nested folders
    header.style.paddingLeft = `${level * 16 + 8}px`;
    item.appendChild(header);
    // Allow dropping directly on folder header
    this.bindDropZone(header, folder.id);

    const expandBtn = document.createElement('button');
    expandBtn.className = 'gv-folder-expand-btn';
    expandBtn.appendChild(createIcon(folder.isExpanded ? 'expand_more' : 'chevron_right'));
    expandBtn.addEventListener('click', () => {
      this.commit((data) => toggleFolderFlag(data, folder.id, 'isExpanded'));
    });
    header.appendChild(expandBtn);

    const icon = document.createElement('span');
    icon.className = 'gv-folder-icon google-symbols';
    icon.dataset.icon = 'folder';
    icon.textContent = 'folder';
    header.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'gv-folder-name gds-label-l';
    name.textContent = folder.name;
    name.addEventListener('dblclick', () => this.renameFolder(folder.id));
    header.appendChild(name);

    const pinBtn = document.createElement('button');
    pinBtn.className = 'gv-folder-pin-btn';
    pinBtn.title = folder.pinned ? t('folder_unpin') : t('folder_pin');
    try {
      pinBtn.dataset.state = folder.pinned ? 'pinned' : 'unpinned';
    } catch {}
    pinBtn.appendChild(createIcon('push_pin'));
    pinBtn.addEventListener('click', () => {
      this.commit((data) => toggleFolderFlag(data, folder.id, 'pinned'));
    });
    header.appendChild(pinBtn);

    const moreBtn = document.createElement('button');
    moreBtn.className = 'gv-folder-actions-btn';
    moreBtn.appendChild(createIcon('more_vert'));
    moreBtn.addEventListener('click', (e) => this.openFolderMenu(e, folder.id));
    header.appendChild(moreBtn);

    // Content (conversations and subfolders)
    if (folder.isExpanded) {
      const content = document.createElement('div');
      content.className = 'gv-folder-content';
      this.bindDropZone(content, folder.id);

      // Render conversations in this folder
      for (const conv of this.options.getData().folderContents[folder.id] || []) {
        const convEl = this.renderConversation(folder.id, conv);
        // Add indentation for nested conversations
        convEl.style.paddingLeft = `${(level + 1) * 16 + 8}px`;
        content.appendChild(convEl);
      }

      // Render subfolders (only for root-level folders, creating 2-level hierarchy)
      if (level === 0) {
        const subfolders = this.options.getData().folders.filter((f) => f.parentId === folder.id);
        for (const subfolder of sortFolders(subfolders)) {
          content.appendChild(this.renderFolder(subfolder, level + 1));
        }
      }

      item.appendChild(content);
    }

    return item;
  }

  renderConversation(folderId: string, conv: ConversationReference): HTMLElement {
    const { t } = this.options;
    const row = document.createElement('div');
    row.className = conv.starred ? 'gv-folder-conversation gv-starred' : 'gv-folder-conversation';
    row.dataset.folderId = folderId;
    row.dataset.conversationId = conv.conversationId;

    const icon = document.createElement('span');
    icon.className = 'gv-conversation-icon google-symbols';
    icon.dataset.icon = 'chat';
    icon.textContent = 'chat';
    row.appendChild(icon);

    const title = document.createElement('span');
    title.className = 'gv-conversation-title gds-label-l';
    title.textContent = conv.title || t('conversation_untitled');
    row.appendChild(title);

    const starBtn = document.createElement('button');
    starBtn.className = conv.starred
      ? 'gv-conversation-star-btn starred'
      : 'gv-conversation-star-btn';
    starBtn.appendChild(createIcon(conv.starred ? 'star' : 'star_outline'));
    starBtn.title = conv.starred ? t('conversation_unstar') : t('conversation_star');
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.commit((data) => toggleConversationStar(data, folderId, conv.conversationId));
    });
    row.appendChild(starBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'gv-conversation-remove-btn';
    removeBtn.appendChild(createIcon('close'));
    removeBtn.title = t('folder_remove_conversation');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.confirmRemoveConversation(folderId, conv.conversationId, conv.title || '', e);
    });
    row.appendChild(removeBtn);

    row.addEventListener('click', () =>
      this.options.navigateToPrompt(conv.conversationId, conv.url),
    );

    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      const data: DragData = {
        type: 'conversation',
        conversationId: conv.conversationId,
        title: conv.title,
        url: conv.url,
        sourceFolderId: folderId,
      };
      try {
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer?.setData('application/json', JSON.stringify(data));
      } catch {}
      try {
        e.dataTransfer?.setDragImage(row, 10, 10);
      } catch {}
    });

    return row;
  }

  openFolderMenu(ev: MouseEvent, folderId: string): void {
    const { t } = this.options;
    ev.stopPropagation();
    const folder = this.options.getData().folders.find((f) => f.id === folderId);
    if (!folder) return;

    const menu = document.createElement('div');
    menu.className = 'gv-folder-menu gv-aistudio-folder-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${ev.clientX}px`;
    menu.style.top = `${ev.clientY}px`;

    const onClickAway = (e: MouseEvent) => {
      if (e.target instanceof Node && !menu.contains(e.target)) {
        closeMenu();
      }
    };
    const closeMenu = () => {
      menu.remove();
      document.removeEventListener('click', onClickAway);
    };

    // Only show "Create subfolder" for root-level folders (to maintain 2-level hierarchy)
    if (!folder.parentId) {
      menu.appendChild(
        createMenuItem(t('folder_create_subfolder'), 'create_new_folder', () => {
          this.createFolder(folderId);
          closeMenu();
        }),
      );
    }

    menu.appendChild(
      createMenuItem(t('folder_rename'), 'edit', () => {
        this.renameFolder(folderId);
        closeMenu();
      }),
    );
    menu.appendChild(
      createMenuItem(
        t('folder_delete'),
        'delete',
        () => {
          this.deleteFolder(folderId);
          closeMenu();
        },
        { danger: true },
      ),
    );

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', onClickAway), 0);
  }

  createFolder(parentId: string | null = null): void {
    const { t, canEdit, getContainer } = this.options;
    if (!canEdit()) return;
    const existingInput = getContainer()?.querySelector<HTMLInputElement>(
      '.gv-folder-inline-input input',
    );
    if (existingInput) {
      existingInput.focus();
      return;
    }

    const {
      wrapper: inputContainer,
      input,
      saveBtn,
      cancelBtn,
    } = createInlineFolderEditor(t, 'div', 'gv-folder-inline-input', 'gv-folder-name-input', {
      placeholder: t('folder_name_prompt'),
    });

    const cancel = () => {
      inputContainer.remove();
    };

    const save = async () => {
      if (!canEdit()) return;
      const name = input.value.trim();
      if (!name) {
        cancel();
        return;
      }

      const folder: Folder = {
        id: uid(),
        name,
        parentId: parentId || null,
        isExpanded: true,
        createdAt: now(),
        updatedAt: now(),
      };
      await this.commitAsync((data) => addFolder(data, folder));
    };

    saveBtn.addEventListener('click', () => {
      void save();
    });
    cancelBtn.addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void save();
      if (e.key === 'Escape') cancel();
    });

    const folderList = getContainer()?.querySelector('.gv-folder-list');
    if (!folderList) return;

    if (parentId) {
      const parentFolder = folderList.querySelector(`[data-folder-id="${parentId}"]`);
      if (parentFolder) {
        const parentContent = parentFolder.querySelector('.gv-folder-content');
        if (parentContent) {
          parentContent.insertBefore(inputContainer, parentContent.firstChild);
        } else {
          parentFolder.insertAdjacentElement('afterend', inputContainer);
        }
      } else {
        folderList.appendChild(inputContainer);
      }
    } else {
      folderList.insertBefore(inputContainer, folderList.firstChild);
    }

    input.focus();
  }

  renameFolder(folderId: string): void {
    const { t, canEdit, getContainer } = this.options;
    if (!canEdit()) return;
    const container = getContainer();
    const activeRenameInput = container?.querySelector<HTMLInputElement>(
      '.gv-folder-rename-inline input',
    );
    if (activeRenameInput) {
      activeRenameInput.focus();
      activeRenameInput.select();
      return;
    }

    const folder = this.options.getData().folders.find((f) => f.id === folderId);
    if (!folder) return;

    const folderEl = container?.querySelector(`[data-folder-id="${folderId}"]`);
    if (!folderEl) return;

    const headerEl = folderEl.querySelector<HTMLElement>('.gv-folder-item-header');
    if (!headerEl) return;

    const folderNameEl = folderEl.querySelector('.gv-folder-name');
    if (!folderNameEl) return;

    const {
      wrapper: inputContainer,
      input,
      saveBtn,
      cancelBtn,
    } = createInlineFolderEditor(t, 'span', 'gv-folder-rename-inline', 'gv-folder-rename-input', {
      value: folder.name,
    });

    const restore = () => {
      headerEl.classList.remove('gv-folder-editing');
      folderNameEl.classList.remove('gv-hidden');
      inputContainer.remove();
    };

    const save = async () => {
      if (!canEdit()) return;
      const name = input.value.trim();
      if (!name) {
        restore();
        return;
      }
      await this.commitAsync((data) => renameFolderInData(data, folderId, name, now()));
    };

    saveBtn.addEventListener('click', () => {
      void save();
    });
    cancelBtn.addEventListener('click', restore);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void save();
      if (e.key === 'Escape') restore();
    });

    folderNameEl.classList.add('gv-hidden');
    headerEl.classList.add('gv-folder-editing');
    headerEl.insertBefore(inputContainer, folderNameEl.nextSibling);
    input.focus();
    input.select();
  }

  deleteFolder(folderId: string): void {
    const { t } = this.options;
    const folderEl = this.options.getContainer()?.querySelector(`[data-folder-id="${folderId}"]`);
    const headerEl = folderEl?.querySelector<HTMLElement>('.gv-folder-item-header');

    showFolderConfirm(
      t,
      headerEl,
      t('folder_delete_confirm'),
      t('folder_remove_conversation_action'),
      () => this.commit((data) => deleteFolderTree(data, folderId)),
    );
  }

  removeConversationFromFolder(folderId: string, conversationId: string): void {
    this.commit((data) => removeConversationFromData(data, folderId, conversationId));
  }

  bindDropZone(el: HTMLElement, targetFolderId: string | null): void {
    // Use a counter to properly track nested dragenter/dragleave events
    // This fixes the issue where child elements trigger spurious leave events
    let dragEnterCounter = 0;

    el.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent bubbling to parent drop zones
      dragEnterCounter++;
      // Only add class on first enter
      if (dragEnterCounter === 1) {
        el.classList.add('gv-folder-dragover');
      }
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent bubbling to parent drop zones
      try {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      } catch {}
    });
    el.addEventListener('dragleave', (e) => {
      e.stopPropagation(); // Prevent bubbling to parent drop zones
      dragEnterCounter--;
      // Only remove class when truly leaving the container (counter reaches 0)
      // Also check relatedTarget as a fallback
      if (dragEnterCounter <= 0) {
        dragEnterCounter = 0; // Prevent negative values
        // Double-check: if relatedTarget is still inside, don't remove
        const related = e.relatedTarget as Node | null;
        if (!related || !el.contains(related)) {
          el.classList.remove('gv-folder-dragover');
        }
      }
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent bubbling to parent drop zones
      dragEnterCounter = 0; // Reset counter on drop
      el.classList.remove('gv-folder-dragover');
      if (!this.options.canEdit()) return;
      const data = parseDragDataFromEvent(e);
      if (!data || data.type !== 'conversation' || !data.conversationId) return;
      const conv: ConversationReference = {
        conversationId: data.conversationId,
        title: normalizeText(data.title) || this.options.t('conversation_untitled'),
        url: data.url || '',
        addedAt: now(),
      };
      this.commit((current) =>
        moveConversationToFolder(current, conv, targetFolderId, this.options.uncategorizedKey),
      );
    });
  }

  private confirmRemoveConversation(
    folderId: string,
    conversationId: string,
    title: string,
    event: MouseEvent,
  ): void {
    const { t } = this.options;
    showFolderConfirm(
      t,
      event.currentTarget as HTMLElement,
      t('folder_remove_conversation_confirm').replace(
        '{title}',
        title || t('conversation_untitled'),
      ),
      t('folder_remove_conversation_action'),
      () => this.removeConversationFromFolder(folderId, conversationId),
      true,
    );
  }

  /** Apply an edit to the current data, then save and re-render without waiting. */
  private commit(update: (data: FolderData) => FolderData): void {
    if (!this.options.canEdit()) return;
    this.options.setData(update(this.options.getData()));
    void this.options.save().then(() => this.options.render());
  }

  private async commitAsync(update: (data: FolderData) => FolderData): Promise<void> {
    this.options.setData(update(this.options.getData()));
    await this.options.save();
    this.options.render();
  }
}
