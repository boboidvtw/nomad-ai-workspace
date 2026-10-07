/**
 * Nomad AI Workspace — ChatGPT FolderManagerModals Component
 */

import React, { useState, useEffect, useRef } from 'react';

import { Folder as FolderIcon, Plus, X, Check } from 'lucide-react';

import { MultiAISidebarTree } from '@/components/MultiAISidebarTree';
import type { Folder } from '@/types/folder';

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

  const modalBg = isDarkTheme
    ? 'bg-zinc-900 border-white/10 text-zinc-100'
    : 'bg-white border-black/10 text-stone-900';
  const inputBg = isDarkTheme
    ? 'bg-black/30 border-white/15 text-white'
    : 'bg-stone-50 border-black/15 text-stone-900';
  const menuBg = isDarkTheme
    ? 'bg-zinc-900 border-white/10 text-zinc-200 shadow-2xl'
    : 'bg-white border-black/10 text-stone-800 shadow-2xl';

  useEffect(() => {
    if (renameFolder) setEditName(renameFolder.name);
  }, [renameFolder]);

  // Close context menu on outside click
  const contextRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        onCloseContextMenu();
      }
    };
    window.addEventListener('mousedown', handleClick, true);
    return () => window.removeEventListener('mousedown', handleClick, true);
  }, [contextMenu, onCloseContextMenu]);

  return (
    <>
      {/* 1. Add Folder Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className={`w-full max-w-sm rounded-xl border p-4 shadow-xl ${modalBg}`}>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <FolderIcon className="h-4 w-4 text-emerald-400" />
                新增 Nomad 資料夾
              </h3>
              <button onClick={onCloseAddModal} className="p-1 text-zinc-400 hover:text-white">
                <X className="h-4 w-4" />
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
                className={`w-full rounded-lg border px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500 ${inputBg}`}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onCloseAddModal}
                className="rounded-lg px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
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
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
              >
                確認新增
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Rename Folder Modal */}
      {renameFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className={`w-full max-w-sm rounded-xl border p-4 shadow-xl ${modalBg}`}>
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-semibold">重新命名資料夾</h3>
              <button onClick={onCloseRenameModal} className="p-1 text-zinc-400 hover:text-white">
                <X className="h-4 w-4" />
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
                className={`w-full rounded-lg border px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500 ${inputBg}`}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onCloseRenameModal}
                className="rounded-lg px-3 py-1.5 text-xs transition-colors hover:bg-white/5"
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
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
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
          <div className="border-b border-white/5 px-2.5 py-1 text-[11px] font-semibold text-zinc-400">
            移動對話至...
          </div>
          <button
            type="button"
            className="w-full px-2.5 py-1.5 text-left text-xs text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
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
                  className={`flex w-full items-center justify-between px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-emerald-500/15 hover:text-emerald-300 ${
                    isInFolder ? 'font-medium text-emerald-400' : ''
                  }`}
                  onClick={() => {
                    onMoveToFolder(contextMenu.conversationId, f.id);
                    onCloseContextMenu();
                  }}
                >
                  <span className="flex-1 truncate">{f.name}</span>
                  {isInFolder && <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Multi-AI Workspace Tree Explorer Modal */}
      {treeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div
            className={`w-full max-w-md overflow-hidden rounded-2xl border shadow-2xl ${modalBg}`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span>📁 Nomad 多平台工作空間</span>
              </div>
              <button
                onClick={onCloseTreeModal}
                className="rounded-md p-1 text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-2">
              <MultiAISidebarTree
                currentPlatform="chatgpt"
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
