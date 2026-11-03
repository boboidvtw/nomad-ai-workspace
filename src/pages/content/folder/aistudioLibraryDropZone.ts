/**
 * The floating folder list that appears while a /library row is dragged, so a prompt
 * can be filed without the sidebar. Drops edit the folder data in place and save.
 */
import { parseDragDataFromEvent } from './aistudioPromptLinks';
import { normalizeText, now, uid } from './aistudioUtils';
import type { ConversationReference, Folder, FolderData } from './types';

// If no dragover arrives for this long while the floating library drop zone is
// visible, treat the drag as over (e.g. the source row was torn out of the DOM by an
// Angular refresh, so dragend never fires) and hide the zone.
const LIBRARY_DRAG_HEARTBEAT_MS = 800;

export interface LibraryDropZoneOptions {
  t: (key: string) => string;
  canEdit: () => boolean;
  getData: () => FolderData;
  save: () => Promise<boolean>;
  /** Changes on every account switch; a drop that awaited across one stays quiet. */
  getScopeRequest: () => number;
  showNotification: (message: string, level: 'info' | 'warning' | 'error') => void;
  uncategorizedKey: string;
}

/**
 * Mount the drop zone on document.body.
 * @returns cleanup that removes the zone and its document listeners
 */
export function mountLibraryDropZone(options: LibraryDropZoneOptions): () => void {
  const { t, canEdit, getData, save, getScopeRequest, showNotification, uncategorizedKey } =
    options;

  // Create a floating container that appears during drag
  const floatingZone = document.createElement('div');
  floatingZone.className = 'gv-library-drop-zone';
  floatingZone.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(32, 33, 36, 0.95);
    border: 2px dashed rgba(138, 180, 248, 0.5);
    border-radius: 12px;
    padding: 16px;
    min-width: 200px;
    max-width: 300px;
    max-height: 400px;
    overflow-y: auto;
    z-index: 2147483646;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s, transform 0.2s;
    transform: translateY(10px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    font-family: 'Google Sans', Roboto, Arial, sans-serif;
  `;

  const title = document.createElement('div');
  title.style.cssText = `
    color: #e8eaed;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  title.innerHTML = `<span class="google-symbols" style="font-size: 18px;">folder</span>${t('folder_title')}`;
  floatingZone.appendChild(title);

  const folderList = document.createElement('div');
  folderList.className = 'gv-library-folder-list';
  floatingZone.appendChild(folderList);

  document.body.appendChild(floatingZone);

  // Update folder list content
  const updateFolderList = () => {
    folderList.innerHTML = '';

    // Add a "Root / Uncategorized" option at the top
    const rootItem = document.createElement('div');
    rootItem.className = 'gv-library-folder-item gv-library-root-item';
    rootItem.style.cssText = `
      padding: 10px 12px;
      margin: 4px 0 12px 0;
      background: rgba(138, 180, 248, 0.1);
      border-radius: 8px;
      color: #8ab4f8;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      transition: background 0.15s, border-color 0.15s;
      border: 2px dashed rgba(138, 180, 248, 0.4);
    `;
    rootItem.innerHTML = `<span class="google-symbols" data-icon="inbox">inbox</span>${t('folder_uncategorized') || 'Uncategorized'}`;

    const onDropToRoot = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!canEdit()) return;
      const scopeRequest = getScopeRequest();
      rootItem.style.background = 'rgba(138, 180, 248, 0.2)';
      rootItem.style.borderColor = '#8ab4f8';

      const data = parseDragDataFromEvent(e);
      if (!data || data.type !== 'conversation' || !data.conversationId) return;

      const conv: ConversationReference = {
        conversationId: data.conversationId,
        title: normalizeText(data.title) || t('conversation_untitled'),
        url: data.url || '',
        addedAt: now(),
      };

      // Add to uncategorized section
      Object.keys(getData().folderContents).forEach((fid) => {
        if (fid === uncategorizedKey) return;
        getData().folderContents[fid] = (getData().folderContents[fid] || []).filter(
          (c) => c.conversationId !== conv.conversationId,
        );
      });

      const uncatArr = getData().folderContents[uncategorizedKey] || [];
      const existsInUncat = uncatArr.some((c) => c.conversationId === conv.conversationId);
      if (!existsInUncat) {
        uncatArr.push(conv);
        getData().folderContents[uncategorizedKey] = uncatArr;
      }

      const saved = await save();
      if (!saved || getScopeRequest() !== scopeRequest) return;
      showNotification(t('conversation_saved_to_root') || 'Saved to Uncategorized', 'info');
    };

    rootItem.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      rootItem.style.background = 'rgba(138, 180, 248, 0.3)';
      rootItem.style.borderColor = '#8ab4f8';
    });
    rootItem.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      } catch {}
    });
    rootItem.addEventListener('dragleave', (e) => {
      e.stopPropagation();
      rootItem.style.background = 'rgba(138, 180, 248, 0.1)';
      rootItem.style.borderColor = 'rgba(138, 180, 248, 0.4)';
    });
    rootItem.addEventListener('drop', onDropToRoot);
    folderList.appendChild(rootItem);

    // Ensure at least one folder exists for the dedicated folder list section
    if (getData().folders.length === 0) {
      const defaultFolder: Folder = {
        id: uid(),
        name: t('folder_default_name') || 'My Folder',
        parentId: null,
        isExpanded: true,
        createdAt: now(),
        updatedAt: now(),
      };
      getData().folders.push(defaultFolder);
      getData().folderContents[defaultFolder.id] = [];
      save();
    }

    // Render folders with proper hierarchy (root folders + their subfolders)
    const rootFolders = getData().folders.filter((f) => !f.parentId);
    // Sort root folders: pinned first, then by creation time
    rootFolders.sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return a.createdAt - b.createdAt;
    });

    // Helper function to create a folder drop item
    const createFolderDropItem = (folder: Folder, isSubfolder: boolean) => {
      const folderItem = document.createElement('div');
      folderItem.className = 'gv-library-folder-item';
      folderItem.dataset.folderId = folder.id;
      const paddingLeft = isSubfolder ? '28px' : '12px';
      folderItem.style.cssText = `
        padding: 10px ${paddingLeft};
        margin: 4px 0;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        color: #e8eaed;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background 0.15s, border-color 0.15s;
        border: 2px solid transparent;
      `;
      const iconName = isSubfolder ? 'subdirectory_arrow_right' : 'folder';
      const icon = document.createElement('span');
      icon.className = 'google-symbols';
      icon.style.cssText = 'font-size: 16px; color: #8ab4f8;';
      icon.textContent = iconName;
      folderItem.append(icon, document.createTextNode(folder.name));

      // Bind drop events
      folderItem.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        folderItem.style.background = 'rgba(138, 180, 248, 0.2)';
        folderItem.style.borderColor = '#8ab4f8';
      });
      folderItem.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        } catch {}
      });
      folderItem.addEventListener('dragleave', (e) => {
        e.stopPropagation();
        folderItem.style.background = 'rgba(255, 255, 255, 0.05)';
        folderItem.style.borderColor = 'transparent';
      });
      folderItem.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!canEdit()) return;
        const scopeRequest = getScopeRequest();
        folderItem.style.background = 'rgba(255, 255, 255, 0.05)';
        folderItem.style.borderColor = 'transparent';

        const data = parseDragDataFromEvent(e);
        if (!data || data.type !== 'conversation' || !data.conversationId) return;

        const conv: ConversationReference = {
          conversationId: data.conversationId,
          title: normalizeText(data.title) || t('conversation_untitled'),
          url: data.url || '',
          addedAt: now(),
        };

        // Add to this folder
        const arr = getData().folderContents[folder.id] || [];
        const exists = arr.some((c) => c.conversationId === conv.conversationId);
        if (!exists) {
          arr.push(conv);
          getData().folderContents[folder.id] = arr;
        }

        // Remove from other folders
        Object.keys(getData().folderContents).forEach((fid) => {
          if (fid === folder.id) return;
          getData().folderContents[fid] = (getData().folderContents[fid] || []).filter(
            (c) => c.conversationId !== conv.conversationId,
          );
        });

        const saved = await save();
        if (!saved || getScopeRequest() !== scopeRequest) return;
        showNotification(
          `${t('conversation_added_to_folder') || 'Added to'} "${folder.name}"`,
          'info',
        );
      });

      return folderItem;
    };

    // Render root folders and their subfolders
    rootFolders.forEach((rootFolder) => {
      folderList.appendChild(createFolderDropItem(rootFolder, false));

      // Render subfolders of this root folder
      const subfolders = getData().folders.filter((f) => f.parentId === rootFolder.id);
      subfolders.sort((a, b) => {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return a.createdAt - b.createdAt;
      });
      subfolders.forEach((subfolder) => {
        folderList.appendChild(createFolderDropItem(subfolder, true));
      });
    });
  };

  // Show/hide the floating zone on drag events
  let zoneVisible = false;
  let dragHeartbeatTimer: number | null = null;

  const clearDragHeartbeat = () => {
    if (dragHeartbeatTimer === null) return;
    clearTimeout(dragHeartbeatTimer);
    dragHeartbeatTimer = null;
  };

  const showZone = () => {
    if (!canEdit()) return;
    zoneVisible = true;
    updateFolderList();
    floatingZone.style.opacity = '1';
    floatingZone.style.pointerEvents = 'auto';
    floatingZone.style.transform = 'translateY(0)';
    armDragHeartbeat();
  };

  const hideZone = () => {
    zoneVisible = false;
    clearDragHeartbeat();
    floatingZone.style.opacity = '0';
    floatingZone.style.pointerEvents = 'none';
    floatingZone.style.transform = 'translateY(10px)';
  };

  // Heartbeat: while the zone is up, every document dragover re-arms this timer. If
  // the source row is removed mid-drag (Angular table refresh), dragend never fires
  // and no drop arrives — the silent gap in dragover traffic hides the zone.
  const armDragHeartbeat = () => {
    clearDragHeartbeat();
    dragHeartbeatTimer = window.setTimeout(() => {
      dragHeartbeatTimer = null;
      hideZone();
    }, LIBRARY_DRAG_HEARTBEAT_MS);
  };

  // Listen for drag events on the document
  const onDragStart = (e: DragEvent) => {
    const target = e.target as HTMLElement;
    // Check if the dragged element is or is within a library table row
    const isLibraryRow = target.closest?.('tr.mat-mdc-row, tr[mat-row]');
    if (isLibraryRow) {
      // Also ensure it's not a row from some other table
      const hasPromptLink = isLibraryRow.querySelector('a[href*="/prompts/"]');
      if (hasPromptLink) {
        setTimeout(showZone, 0);
      }
    }
  };

  const onDragOver = () => {
    if (!zoneVisible) return;
    armDragHeartbeat();
  };

  const onDragEnd = () => {
    setTimeout(hideZone, 100);
  };

  // Belt-and-suspenders alongside dragend: a drop anywhere in the document also
  // dismisses the zone (covers sources whose dragend is swallowed).
  const onDrop = () => {
    setTimeout(hideZone, 100);
  };

  // Capture phase: library rows stop their own dragstart from propagating (to keep
  // Angular Material out of it), so a bubbling listener here would never hear it.
  document.addEventListener('dragstart', onDragStart, true);
  document.addEventListener('dragover', onDragOver);
  document.addEventListener('dragend', onDragEnd);
  document.addEventListener('drop', onDrop);

  return () => {
    clearDragHeartbeat();
    try {
      document.removeEventListener('dragstart', onDragStart, true);
    } catch {}
    try {
      document.removeEventListener('dragover', onDragOver);
    } catch {}
    try {
      document.removeEventListener('dragend', onDragEnd);
    } catch {}
    try {
      document.removeEventListener('drop', onDrop);
    } catch {}
    try {
      floatingZone.remove();
    } catch {}
  };
}
