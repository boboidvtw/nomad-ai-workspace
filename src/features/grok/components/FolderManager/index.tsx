/**
 * Nomad AI Workspace — Grok FolderManager Main Component
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';

import { Plus, Cloud, Layers, RefreshCw } from 'lucide-react';

import { MultiAISidebarTree } from '@/components/MultiAISidebarTree';
import type { Folder } from '@/types/folder';

import { useGrokConversations } from '../../hooks/useGrokConversations';
import { useGrokFolders } from '../../hooks/useGrokFolders';
import { saveGrokFolders } from '../../services/storage';
import { FolderList } from './FolderList';
import { FolderManagerModals } from './FolderManagerModals';

export default function GrokFolderManager() {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    conversationId: string;
  } | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Folder | null>(null);
  const [treeModalOpen, setTreeModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  React.useEffect(() => {
    const handleToggle = () => setTreeModalOpen((prev) => !prev);
    window.addEventListener('nomad:toggle-workspace-modal', handleToggle);
    return () => window.removeEventListener('nomad:toggle-workspace-modal', handleToggle);
  }, []);

  const {
    folders,
    addFolder,
    renameFolder,
    removeFolder,
    toggleExpanded,
    moveConversationToFolder,
  } = useGrokFolders();

  const { portalContainer, conversationTitleIndex, isDarkTheme } = useGrokConversations({
    onConversationContextMenu: (payload) => setContextMenu(payload),
  });

  const handleSyncToDrive = async () => {
    try {
      setIsSyncing(true);
      // 1. Download cloud folders first
      const downloadRes = await new Promise<{ ok?: boolean; data?: unknown }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'nomad.sync.downloadGrok',
            payload: { interactive: true },
          },
          (res) => resolve(res || {}),
        );
      });

      let mergedFolders = [...folders];
      if (downloadRes?.ok && downloadRes.data) {
        const rawCloud = downloadRes.data;
        const cloudFolders: Folder[] = (
          Array.isArray(rawCloud) ? rawCloud : (rawCloud as { folders?: Folder[] }).folders || []
        ) as Folder[];

        const localMap = new Map<string, Folder>(mergedFolders.map((f) => [f.id, f]));
        cloudFolders.forEach((cloudF) => {
          const existing = localMap.get(cloudF.id);
          if (!existing) {
            mergedFolders.push(cloudF);
          } else {
            const mergedConvIds = Array.from(
              new Set([...(existing.conversationIds || []), ...(cloudF.conversationIds || [])]),
            );
            const idx = mergedFolders.findIndex((f) => f.id === cloudF.id);
            if (idx !== -1) {
              mergedFolders[idx] = {
                ...existing,
                conversationIds: mergedConvIds,
              };
            }
          }
        });

        await saveGrokFolders(mergedFolders);
      }

      // 2. Upload merged folders
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: 'nomad.sync.uploadGrok',
            payload: { folders: mergedFolders, interactive: true },
          },
          (res) => {
            if (res?.ok) {
              console.log(
                '[Nomad Workspace] Grok folders bidirectional sync completed successfully!',
              );
              resolve();
            } else {
              reject(new Error(res?.error || 'Upload failed'));
            }
          },
        );
      });
    } catch (e) {
      console.error('[Nomad Workspace] Failed to sync Grok folders to Drive:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const textPrimary = isDarkTheme ? 'text-zinc-200' : 'text-stone-800';
  const textMuted = isDarkTheme ? 'text-zinc-400' : 'text-stone-500';
  const bgHover = isDarkTheme ? 'hover:bg-white/10' : 'hover:bg-black/10';

  const content = (
    <div className="nomad-grok-folder-manager mb-1 font-sans text-xs select-none">
      <MultiAISidebarTree
        currentPlatform="grok"
        theme={isDarkTheme ? 'dark' : 'light'}
        onOpenSyncSettings={handleSyncToDrive}
      >
        <div className="nomad-local-folder-section mb-1 pb-2">
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-white/5 px-2 py-1.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-sky-500 shadow-sm shadow-sky-500/50" />
              <span className={`font-semibold tracking-wide ${textPrimary}`}>Nomad 資料夾</span>
            </div>

            <div className="flex items-center gap-1">
              {/* Cloud Sync Button */}
              <button
                type="button"
                className={`rounded p-1 ${bgHover} ${textMuted} transition-colors hover:text-sky-400`}
                title="同步 Grok 資料夾至 Google Drive"
                disabled={isSyncing}
                onClick={handleSyncToDrive}
              >
                {isSyncing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-sky-400" />
                ) : (
                  <Cloud className="h-3.5 w-3.5" />
                )}
              </button>

              {/* Full Multi-AI Tree Button */}
              <button
                type="button"
                className={`rounded p-1 ${bgHover} ${textMuted} transition-colors hover:text-sky-400`}
                title="開啟 Nomad 多平台總覽樹"
                onClick={() => setTreeModalOpen(true)}
              >
                <Layers className="h-3.5 w-3.5" />
              </button>

              {/* Add Folder Button */}
              <button
                type="button"
                className={`rounded p-1 ${bgHover} text-sky-400 transition-colors hover:text-sky-300`}
                title="新增資料夾"
                onClick={() => setAddModalOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Folder Tree List */}
          <FolderList
            folders={folders}
            titleCache={conversationTitleIndex}
            isDarkTheme={isDarkTheme}
            onToggleExpanded={toggleExpanded}
            onRename={(folder) => setRenameTarget(folder)}
            onDelete={(folder) => removeFolder(folder.id)}
            onRemoveConversation={(convId, _folderId) => moveConversationToFolder(convId, null)}
            onDropConversation={(convId, folderId) => moveConversationToFolder(convId, folderId)}
          />
        </div>
      </MultiAISidebarTree>

      {/* Modals & Dialogs */}
      <FolderManagerModals
        isDarkTheme={isDarkTheme}
        addModalOpen={addModalOpen}
        onCloseAddModal={() => setAddModalOpen(false)}
        onConfirmAddFolder={(name) => addFolder(name)}
        renameFolder={renameTarget}
        onCloseRenameModal={() => setRenameTarget(null)}
        onConfirmRenameFolder={(folderId, name) => renameFolder(folderId, name)}
        contextMenu={contextMenu}
        folders={folders}
        onCloseContextMenu={() => setContextMenu(null)}
        onMoveToFolder={(convId, folderId) => moveConversationToFolder(convId, folderId)}
        treeModalOpen={treeModalOpen}
        onCloseTreeModal={() => setTreeModalOpen(false)}
        onOpenSyncSettings={handleSyncToDrive}
      />
    </div>
  );

  if (!portalContainer) {
    return null;
  }

  return createPortal(content, portalContainer);
}
