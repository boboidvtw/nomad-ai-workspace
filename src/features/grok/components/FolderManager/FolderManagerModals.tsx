/**
 * Nomad AI Workspace — Grok FolderManager Modals & Dialogs
 */

import React, { useState, useEffect, useRef } from 'react';
import { Folder as FolderIcon, X, Check } from 'lucide-react';
import type { Folder } from '@/types/folder';
import { MultiAISidebarTree } from '@/components/MultiAISidebarTree';

interface Props {
  isDarkTheme: boolean;
  addModalOpen: boolean;
  onCloseAddModal: () => void;
  onConfirmAddFolder: (name: string) => void;
  renameFolder: Folder | null;
  onCloseRenameModal: () => void;
  onConfirmRenameFolder: (folderId: string, name: string) => void;
  contextMenu: { x: number; y: number; conversationId: string } | null;
  folders: Folder[];
  onCloseContextMenu: () => void;
  onMoveToFolder: (conversationId: string, folderId: string | null) => void;
  treeModalOpen: boolean;
  onCloseTreeModal: () => void;
  onOpenSyncSettings?: () => void;
}

export const FolderManagerModals: React.FC<Props> = ({
  isDarkTheme,
  addModalOpen,
  onCloseAddModal,
  onConfirmAddFolder,
  renameFolder,
  onCloseRenameModal,
  onConfirmRenameFolder,
  contextMenu,
  folders,
  onCloseContextMenu,
  onMoveToFolder,
  treeModalOpen,
  onCloseTreeModal,
  onOpenSyncSettings,
}) => {
  const [newFolderName, setNewFolderName] = useState('');
  const [editName, setEditName] = useState('');
  const contextRef = useRef<HTMLDivElement>(null);

  const modalBg = isDarkTheme ? 'bg-zinc-900 border-white/10 text-zinc-100' : 'bg-white border-black/10 text-stone-900';
  const inputBg = isDarkTheme ? 'bg-zinc-800 border-white/10 text-zinc-100 placeholder-zinc-500' : 'bg-stone-100 border-black/10 text-stone-900 placeholder-stone-400';
  const menuBg = isDarkTheme ? 'bg-zinc-900 border-white/10 text-zinc-100 shadow-xl' : 'bg-white border-black/10 text-stone-900 shadow-xl';

  useEffect(() => {
    if (renameFolder) {
      setEditName(renameFolder.name);
    }
  }, [renameFolder]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        onCloseContextMenu();
      }
    };
    if (contextMenu) {
      window.addEventListener('mousedown', handleClick, true);
    }
    return () => window.removeEventListener('mousedown', handleClick, true);
  }, [contextMenu, onCloseContextMenu]);

  return (
    <>
      {/* 1. Add Folder Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className={`w-full max-w-sm rounded-xl border p-4 shadow-xl ${modalBg}`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FolderIcon className="w-4 h-4 text-sky-400" />
                新增 Nomad 資料夾 (Grok)
              </h3>
              <button onClick={onCloseAddModal} className="text-zinc-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-3">
              <input
                type="text"
                autoFocus
                placeholder="資料夾名稱..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFolderName.trim()) {
                    onConfirmAddFolder(newFolderName.trim());
                    setNewFolderName('');
                    onCloseAddModal();
                  } else if (e.key === 'Escape') {
                    onCloseAddModal();
                  }
                }}
                className={`w-full px-3 py-2 text-xs rounded-lg border outline-none focus:ring-1 focus:ring-sky-500 ${inputBg}`}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onCloseAddModal}
                className="px-3 py-1.5 text-xs rounded-lg hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!newFolderName.trim()}
                onClick={() => {
                  if (newFolderName.trim()) {
                    onConfirmAddFolder(newFolderName.trim());
                    setNewFolderName('');
                    onCloseAddModal();
                  }
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium transition-colors"
              >
                確認新增
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Rename Folder Modal */}
      {renameFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className={`w-full max-w-sm rounded-xl border p-4 shadow-xl ${modalBg}`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-sm font-semibold">重新命名資料夾</h3>
              <button onClick={onCloseRenameModal} className="text-zinc-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-3">
              <input
                type="text"
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editName.trim()) {
                    onConfirmRenameFolder(renameFolder.id, editName.trim());
                    onCloseRenameModal();
                  } else if (e.key === 'Escape') {
                    onCloseRenameModal();
                  }
                }}
                className={`w-full px-3 py-2 text-xs rounded-lg border outline-none focus:ring-1 focus:ring-sky-500 ${inputBg}`}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onCloseRenameModal}
                className="px-3 py-1.5 text-xs rounded-lg hover:bg-white/5 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!editName.trim()}
                onClick={() => {
                  if (editName.trim()) {
                    onConfirmRenameFolder(renameFolder.id, editName.trim());
                    onCloseRenameModal();
                  }
                }}
                className="px-3 py-1.5 text-xs rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium transition-colors"
              >
                儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Move to Folder Context Menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className={`fixed z-50 w-44 rounded-lg border py-1 ${menuBg}`}
          style={{
            top: Math.min(window.innerHeight - 200, contextMenu.y),
            left: Math.min(window.innerWidth - 180, contextMenu.x),
          }}
        >
          <div className="px-2.5 py-1 text-[11px] font-semibold text-zinc-400 border-b border-white/5">
            移動 Grok 對話至...
          </div>
          <button
            type="button"
            className="w-full px-2.5 py-1.5 text-xs text-left hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
            onClick={() => {
              onMoveToFolder(contextMenu.conversationId, null);
              onCloseContextMenu();
            }}
          >
            ❌ 移除資料夾歸檔
          </button>
          <div className="my-1 border-t border-white/5" />
          <div className="max-h-48 overflow-y-auto">
            {folders.map((f) => {
              const isInFolder = f.conversationIds.includes(contextMenu.conversationId);
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`flex items-center justify-between w-full px-2.5 py-1.5 text-xs text-left hover:bg-sky-500/15 hover:text-sky-300 transition-colors ${
                    isInFolder ? 'text-sky-400 font-medium' : ''
                  }`}
                  onClick={() => {
                    onMoveToFolder(contextMenu.conversationId, f.id);
                    onCloseContextMenu();
                  }}
                >
                  <span className="truncate flex-1">{f.name}</span>
                  {isInFolder && <Check className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Multi-AI Workspace Tree Explorer Modal */}
      {treeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${modalBg}`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="text-sm font-semibold flex items-center gap-2">
                <span>📁 Nomad 多平台工作空間</span>
              </div>
              <button onClick={onCloseTreeModal} className="text-zinc-400 hover:text-white p-1 rounded-md">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2 max-h-[70vh] overflow-y-auto">
              <MultiAISidebarTree
                currentPlatform="grok"
                theme={isDarkTheme ? 'dark' : 'light'}
                onOpenSyncSettings={onOpenSyncSettings}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
