/**
 * Nomad AI Workspace — ChatGPT FolderList Component
 */

import React from 'react';
import type { Folder } from '@/types/folder';
import type { ConversationTitleCache } from '../../services/storage';
import { FolderItem } from './FolderItem';

interface Props {
  folders: Folder[];
  titleCache: ConversationTitleCache;
  isDarkTheme: boolean;
  onToggleExpanded: (folderId: string) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  onRemoveConversation: (conversationId: string, folderId: string) => void;
  onDropConversation: (conversationId: string, folderId: string) => void;
}

export const FolderList: React.FC<Props> = ({
  folders,
  titleCache,
  isDarkTheme,
  onToggleExpanded,
  onRename,
  onDelete,
  onRemoveConversation,
  onDropConversation,
}) => {
  if (folders.length === 0) {
    return (
      <div className="px-3 py-3 text-center text-xs text-zinc-500 italic select-none">
        尚無資料夾，點擊上方「+」新增並拖曳對話歸檔
      </div>
    );
  }

  return (
    <div className="space-y-0.5 py-1">
      {folders.map((folder) => (
        <FolderItem
          key={folder.id}
          folder={folder}
          titleCache={titleCache}
          isDarkTheme={isDarkTheme}
          onToggleExpanded={onToggleExpanded}
          onRename={onRename}
          onDelete={onDelete}
          onRemoveConversation={onRemoveConversation}
          onDropConversation={onDropConversation}
        />
      ))}
    </div>
  );
};
