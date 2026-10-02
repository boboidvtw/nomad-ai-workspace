/**
 * Nomad AI Workspace — Grok FolderItem Component
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
      e.dataTransfer.getData('application/x-nomad-grok-conversation') ||
      e.dataTransfer.getData('text/plain');
    if (convId) {
      onDropConversation(convId, folder.id);
    }
  };

  return (
    <div
      className={`rounded-lg transition-colors select-none ${
        isDragOver ? 'bg-sky-500/15 ring-1 ring-sky-500' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Folder Header */}
      <div
        className={`group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer ${bgHover} transition-colors`}
        onClick={() => onToggleExpanded(folder.id)}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {folder.isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
          )}
          {folder.isExpanded ? (
            <FolderOpen className="w-4 h-4 text-sky-400 flex-shrink-0" />
          ) : (
            <FolderIcon className="w-4 h-4 text-sky-400 flex-shrink-0" />
          )}
          <span className={`text-xs font-medium truncate ${textPrimary}`} title={folder.name}>
            {folder.name}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">({folder.conversationIds.length})</span>
        </div>

        {/* Action Menu Trigger */}
        <div className="relative">
          <button
            type="button"
            className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 text-zinc-400 hover:text-white transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            title="資料夾選單"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {menuOpen && (
            <div
              className={`absolute right-0 top-full mt-1 w-28 rounded-md shadow-lg border py-1 z-30 ${menuBg}`}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className={`flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs text-left ${bgHover} ${textPrimary}`}
                onClick={() => {
                  setMenuOpen(false);
                  onRename(folder);
                }}
              >
                <Pencil className="w-3 h-3 text-zinc-400" />
                重新命名
              </button>
              <button
                type="button"
                className={`flex items-center gap-1.5 w-full px-2.5 py-1.5 text-xs text-left text-red-400 ${bgHover}`}
                onClick={() => {
                  setMenuOpen(false);
                  onDelete(folder);
                }}
              >
                <Trash2 className="w-3 h-3 text-red-400" />
                刪除資料夾
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filed Conversations */}
      {folder.isExpanded && folder.conversationIds.length > 0 && (
        <div className="pl-6 pr-1 py-0.5 space-y-0.5">
          {folder.conversationIds.map((id) => {
            const title = titleCache[id] || `對話 (${id.slice(0, 8)})`;
            return (
              <div
                key={id}
                className={`group/item flex items-center justify-between px-2 py-1 rounded text-xs truncate ${bgHover} transition-colors`}
              >
                <a
                  href={`/chat/${id}`}
                  className={`flex items-center gap-1.5 truncate flex-1 no-underline ${textMuted} hover:text-sky-400`}
                  title={title}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    const nativeLink =
                      document.querySelector<HTMLAnchorElement>(`nav a[href*="${id}"]`) ||
                      document.querySelector<HTMLAnchorElement>(`a[href*="/chat/${id}"]`) ||
                      document.querySelector<HTMLAnchorElement>(`a[href*="/c/${id}"]`);
                    if (nativeLink) {
                      nativeLink.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
                      nativeLink.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                      nativeLink.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                      nativeLink.click();
                      return;
                    }
                    try {
                      window.history.pushState({}, '', `/chat/${id}`);
                      window.dispatchEvent(
                        typeof PopStateEvent === 'function'
                          ? new PopStateEvent('popstate', { state: window.history.state })
                          : new Event('popstate')
                      );
                    } catch {
                      window.location.href = `/chat/${id}`;
                    }
                  }}
                >
                  <MessageSquare className="w-3 h-3 opacity-60 flex-shrink-0" />
                  <span className="truncate">{title}</span>
                </a>
                <button
                  type="button"
                  className="opacity-0 group-hover/item:opacity-100 p-0.5 rounded text-zinc-500 hover:text-red-400 transition-opacity flex-shrink-0"
                  title="從此資料夾移除"
                  onClick={() => onRemoveConversation(id, folder.id)}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
