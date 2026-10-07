/**
 * Nomad AI Workspace — ChatGPT FolderItem Component
 */

import React, { useState } from 'react';

import {
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen,
  MoreVertical,
  Pencil,
  Trash2,
  X,
  MessageSquare,
} from 'lucide-react';

import type { Folder } from '@/types/folder';

import type { ConversationTitleCache } from '../../services/storage';

interface Props {
  folder: Folder;
  titleCache: ConversationTitleCache;
  isDarkTheme: boolean;
  onToggleExpanded: (folderId: string) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  onRemoveConversation: (conversationId: string, folderId: string) => void;
  onDropConversation: (conversationId: string, folderId: string) => void;
}

export const FolderItem: React.FC<Props> = ({
  folder,
  titleCache,
  isDarkTheme,
  onToggleExpanded,
  onRename,
  onDelete,
  onRemoveConversation,
  onDropConversation,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const textPrimary = isDarkTheme ? 'text-zinc-200' : 'text-stone-800';
  const textMuted = isDarkTheme ? 'text-zinc-400' : 'text-stone-500';
  const bgHover = isDarkTheme ? 'hover:bg-white/5' : 'hover:bg-black/5';
  const menuBg = isDarkTheme ? 'bg-zinc-900 border-white/10' : 'bg-white border-black/10';

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const convId =
      e.dataTransfer.getData('application/x-nomad-chatgpt-conversation') ||
      e.dataTransfer.getData('text/plain');
    if (convId) {
      onDropConversation(convId, folder.id);
    }
  };

  return (
    <div
      className={`rounded-lg transition-colors select-none ${
        isDragOver ? 'bg-emerald-500/15 ring-1 ring-emerald-500' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Folder Header */}
      <div
        className={`group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 ${bgHover} transition-colors`}
        onClick={() => onToggleExpanded(folder.id)}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {folder.isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
          )}
          {folder.isExpanded ? (
            <FolderOpen className="h-4 w-4 flex-shrink-0 text-emerald-400" />
          ) : (
            <FolderIcon className="h-4 w-4 flex-shrink-0 text-emerald-400" />
          )}
          <span className={`truncate text-xs font-medium ${textPrimary}`} title={folder.name}>
            {folder.name}
          </span>
          <span className="font-mono text-[10px] text-zinc-500">
            ({folder.conversationIds.length})
          </span>
        </div>

        {/* Action Menu Trigger */}
        <div className="relative">
          <button
            type="button"
            className="rounded p-1 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-white/10 hover:text-white"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            title="資料夾選單"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>

          {menuOpen && (
            <div
              className={`absolute top-full right-0 z-30 mt-1 w-28 rounded-md border py-1 shadow-lg ${menuBg}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs ${bgHover} ${textPrimary}`}
                onClick={() => {
                  setMenuOpen(false);
                  onRename(folder);
                }}
              >
                <Pencil className="h-3 w-3 text-zinc-400" />
                重新命名
              </button>
              <button
                type="button"
                className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs text-red-400 ${bgHover}`}
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(folder);
                }}
              >
                <Trash2 className="h-3 w-3 text-red-400" />
                刪除資料夾
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filed Conversations */}
      {folder.isExpanded && folder.conversationIds.length > 0 && (
        <div className="space-y-0.5 py-0.5 pr-1 pl-6">
          {folder.conversationIds.map((id) => {
            const title = titleCache[id] || `對話 (${id.slice(0, 8)})`;
            return (
              <div
                key={id}
                className={`group/item flex items-center justify-between truncate rounded px-2 py-1 text-xs ${bgHover} transition-colors`}
              >
                <a
                  href={`/c/${id}`}
                  className={`flex flex-1 items-center gap-1.5 truncate no-underline ${textMuted} hover:text-emerald-400`}
                  title={title}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    const nativeLink =
                      document.querySelector<HTMLAnchorElement>(`nav a[href*="${id}"]`) ||
                      document.querySelector<HTMLAnchorElement>(`a[href^="/c/${id}"]`);
                    if (nativeLink) {
                      nativeLink.dispatchEvent(
                        new MouseEvent('pointerdown', { bubbles: true, cancelable: true }),
                      );
                      nativeLink.dispatchEvent(
                        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
                      );
                      nativeLink.dispatchEvent(
                        new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
                      );
                      nativeLink.click();
                      return;
                    }
                    try {
                      window.history.pushState({}, '', `/c/${id}`);
                      window.dispatchEvent(
                        typeof PopStateEvent === 'function'
                          ? new PopStateEvent('popstate', { state: window.history.state })
                          : new Event('popstate'),
                      );
                    } catch {
                      window.location.href = `/c/${id}`;
                    }
                  }}
                >
                  <MessageSquare className="h-3 w-3 flex-shrink-0 opacity-60" />
                  <span className="truncate">{title}</span>
                </a>
                <button
                  type="button"
                  className="flex-shrink-0 rounded p-0.5 text-zinc-500 opacity-0 transition-opacity group-hover/item:opacity-100 hover:text-red-400"
                  title="從此資料夾移除"
                  onClick={() => onRemoveConversation(id, folder.id)}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
