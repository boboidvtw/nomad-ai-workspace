/**
 * Nomad AI Workspace — ChatGPT FolderManager Main Component
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Cloud, Layers, RefreshCw } from 'lucide-react';
import type { Folder } from '@/types/folder';
import { saveChatGPTFolders } from '../../services/storage';
import { useChatGPTFolders } from '../../hooks/useChatGPTFolders';
import { useChatGPTConversations } from '../../hooks/useChatGPTConversations';
import { FolderList } from './FolderList';
import { FolderManagerModals } from './FolderManagerModals';
import { MultiAISidebarTree } from '@/components/MultiAISidebarTree';

export default function ChatGPTFolderManager() {
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
    window.addEventListener("nomad:toggle-workspace-modal", handleToggle);
    return () => window.removeEventListener("nomad:toggle-workspace-modal", handleToggle);
  }, []);

  const {
    folders,
    addFolder,
    renameFolder,
    removeFolder,
    toggleExpanded,
    moveConversationToFolder,
  } = useChatGPTFolders();

  const { portalContainer, conversationTitleIndex, isDarkTheme } = useChatGPTConversations({
    onConversationContextMenu: (payload) => setContextMenu(payload),
  });

  const handleSyncToDrive = async () => {
    try {
      setIsSyncing(true);
      // 1. Download cloud folders first
      const downloadRes = await new Promise<{ ok?: boolean; data?: unknown }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'nomad.sync.downloadChatGPT',
            payload: { interactive: true },
          },
          (res) => resolve(res || {}),
        );
      });

      let mergedFolders = [...folders];
      if (downloadRes?.ok && downloadRes.data) {
        const rawCloud = downloadRes.data;
        const cloudFolders: Folder[] = (
          Array.isArray(rawCloud)
            ? rawCloud
            : ((rawCloud as { folders?: Folder[] }).folders || [])
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
      }

      // 2. Persist merged folders to local chrome.storage
      await saveChatGPTFolders(mergedFolders);

      // 3. Upload merged folders to Google Drive
      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: 'nomad.sync.uploadChatGPT',
            payload: { folders: mergedFolders, interactive: true },
          },
          (res) => {
            if (res?.ok) {
              console.log('[Nomad Workspace] ChatGPT folders bidirectional sync completed successfully!');
              resolve();
            } else {
              reject(new Error(res?.error || 'Upload failed'));
            }
          },
        );
      });
    } catch (e) {
      console.error('[Nomad Workspace] Failed to sync ChatGPT folders to Drive:', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const textPrimary = isDarkTheme ? 'text-zinc-200' : 'text-stone-800';
  const textMuted = isDarkTheme ? 'text-zinc-400' : 'text-stone-500';
  const bgHover = isDarkTheme ? 'hover:bg-white/10' : 'hover:bg-black/10';

  const content = (
    <div className="nomad-chatgpt-folder-manager font-sans text-xs select-none mb-1">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/5">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50 flex-shrink-0" />
          <span className={`font-semibold tracking-wide ${textPrimary}`}>Nomad 資料夾</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Cloud Sync Button */}
          <button
            type="button"
            className={`p-1 rounded ${bgHover} ${textMuted} hover:text-emerald-400 transition-colors`}
            title="同步 ChatGPT 資料夾至 Google Drive"
            disabled={isSyncing}
            onClick={handleSyncToDrive}
          >
            {isSyncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <Cloud className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Full Multi-AI Tree Button */}
          <button
            type="button"
            className={`p-1 rounded ${bgHover} ${textMuted} hover:text-emerald-400 transition-colors`}
            title="開啟 Nomad 多平台總覽樹"
            onClick={() => setTreeModalOpen(true)}
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          {/* Add Folder Button */}
          <button
            type="button"
            className={`p-1 rounded ${bgHover} text-emerald-400 hover:text-emerald-300 transition-colors`}
            title="新增資料夾"
            onClick={() => setAddModalOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
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

      {/* Multi-AI Cross-Platform Workspace section */}
      <div
        className="nomad-multi-ai-section"
        style={{
          borderTop: isDarkTheme ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(0, 0, 0, 0.08)",
          marginTop: "12px",
          paddingTop: "8px",
        }}
      >
        <MultiAISidebarTree currentPlatform="chatgpt" theme={isDarkTheme ? "dark" : "light"} onOpenSyncSettings={handleSyncToDrive} />
      </div>

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

  if (portalContainer) {
    return createPortal(content, portalContainer);
  }

  return content;
}
