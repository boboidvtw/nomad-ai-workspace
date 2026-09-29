/**
 * Connects FolderManager hooks and composes the UI components (no modal JSX).
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Plus, User, Cloud, Settings, FolderOpen, RefreshCw } from 'lucide-react';
import type { Folder } from '@src/types/folder';
import { useConversations } from '../../hooks/useConversations';
import { useFolders } from '../../hooks/useFolders';
import { useSidebarOpen } from '../../hooks/useSidebarOpen';
import FolderList from './FolderList';
import { MultiAISidebarTree } from '@/components/MultiAISidebarTree';
import { FolderManagerModals } from './FolderManagerModals';

type ThemeTokens = {
  rootText: string;
  headerText: string;
  mutedText: string;
  subtleText: string;
  border: string;
  panelBg: string;
  hoverBg: string;
  input: string;
  icon: string;
  iconDanger: string;
  iconHoverBg: string;
  menu: string;
  divider: string;
};

const getThemeTokens = (isDarkTheme: boolean): ThemeTokens => {
  if (isDarkTheme) {
    return {
      rootText: 'text-zinc-200',
      headerText: 'text-zinc-400',
      mutedText: 'text-zinc-500',
      subtleText: 'text-zinc-600',
      border: 'border-white/10',
      panelBg: 'bg-transparent',
      hoverBg: 'hover:bg-white/5',
      input: 'border-white/10 bg-black/20 text-zinc-200 placeholder:text-zinc-600 focus:border-white/20 focus:ring-0',
      icon: 'text-zinc-500 hover:text-zinc-300',
      iconDanger: 'text-zinc-500 hover:text-red-400',
      iconHoverBg: 'hover:bg-white/10',
      menu: 'border-white/10 bg-zinc-900 text-zinc-200',
      divider: 'bg-white/10',
    };
  }

  return {
    rootText: 'text-stone-800',
    headerText: 'text-stone-500',
    mutedText: 'text-stone-400',
    subtleText: 'text-stone-300',
    border: 'border-black/5',
    panelBg: 'bg-transparent',
    hoverBg: 'hover:bg-black/5',
    input: 'border-black/10 bg-white/50 text-stone-800 placeholder:text-stone-400 focus:border-black/20 focus:ring-0',
    icon: 'text-stone-400 hover:text-stone-700',
    iconDanger: 'text-stone-400 hover:text-red-600',
    iconHoverBg: 'hover:bg-black/5',
    menu: 'border-black/5 bg-white text-stone-800',
    divider: 'bg-black/5',
  };
};

export default function FolderManager() {
  const { t } = useTranslation();
  const isSidebarOpen = useSidebarOpen();
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    conversationId: string;
  } | null>(null);

  const {
    folders,
    allConversationIdsInFolders,
    addFolder,
    renameFolder,
    removeFolder,
    toggleExpanded,
    moveConversationToFolder,
  } = useFolders();
  const handleConversationContextMenu = (payload: { x: number; y: number; conversationId: string }) => setContextMenu(payload);

  const { portalContainer, conversationIndex, conversationTitleIndex, isDarkTheme } = useConversations({
    hiddenConversationIds: allConversationIdsInFolders,
    onConversationContextMenu: handleConversationContextMenu,
  });

  const theme = useMemo(() => getThemeTokens(isDarkTheme), [isDarkTheme]);

  // Storage keys for Claude Voyager (different from Gemini Voyager)
  const FOLDERS_KEY = 'claude_nexus_folders';
  const PROMPTS_KEY = 'promptLibrary';

  // Google Drive Sync & Local Backup states
  const [syncState, setSyncState] = useState<{
    isAuthenticated: boolean;
    isSyncing: boolean;
    lastSyncTime: number | null;
    lastUploadTime: number | null;
  } | null>(null);

  const fetchSyncState = () => {
    try {
      chrome.runtime.sendMessage({ type: 'cv.sync.getState' }, (response) => {
        if (response && response.ok && response.state) {
          setSyncState(response.state);
        }
      });
    } catch (e) {
      console.warn('Failed to fetch sync state:', e);
    }
  };

  useEffect(() => {
    fetchSyncState();
    const handleStorageChange = () => {
      fetchSyncState();
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const mergeFoldersLocal = (local: Folder[], imported: Folder[]): Folder[] => {
    const localMap = new Map<string, Folder>(local.map((f) => [f.id, f]));
    const result: Folder[] = [...local];

    imported.forEach((importedFolder) => {
      const existing = localMap.get(importedFolder.id);
      if (!existing) {
        result.push(importedFolder);
      } else {
        const mergedConvIds = Array.from(
          new Set([...existing.conversationIds, ...importedFolder.conversationIds])
        );
        const idx = result.findIndex((f) => f.id === importedFolder.id);
        if (idx !== -1) {
          result[idx] = {
            ...existing,
            conversationIds: mergedConvIds,
          };
        }
      }
    });

    return result;
  };

  const exportLocalBackup = () => {
    try {
      chrome.storage.local.get([FOLDERS_KEY, PROMPTS_KEY], (result) => {
        const foldersData = result[FOLDERS_KEY] || [];
        const promptsData = result[PROMPTS_KEY] || [];
        const data = {
          format: 'claude-voyager.sync.v1',
          exportedAt: new Date().toISOString(),
          version: '1.4.1',
          folders: {
            format: 'claude-voyager.folders.v1',
            exportedAt: new Date().toISOString(),
            version: '1.4.1',
            data: foldersData,
          },
          prompts: {
            format: 'claude-voyager.prompts.v1',
            exportedAt: new Date().toISOString(),
            version: '1.4.1',
            items: promptsData,
          }
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `claude-voyager-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    } catch (e) {
      alert('匯出失敗：' + String(e));
    }
  };

  const importLocalBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const payload = JSON.parse(event.target?.result as string);
          if (payload && payload.format === 'claude-voyager.sync.v1') {
            const cloudFolders = payload.folders?.data || [];
            const cloudPrompts = payload.prompts?.items || [];
            
            const localRes = await chrome.storage.local.get([FOLDERS_KEY, PROMPTS_KEY]);
            const localFolders = localRes[FOLDERS_KEY] || [];
            const localPrompts = localRes[PROMPTS_KEY] || [];

            const mergedFolders = mergeFoldersLocal(localFolders, cloudFolders);
            
            // merge prompts
            const localPromptMap = new Map(localPrompts.map((p: any) => [p.id, p]));
            const mergedPrompts = [...localPrompts];
            cloudPrompts.forEach((cp: any) => {
              if (!localPromptMap.has(cp.id)) {
                mergedPrompts.push(cp);
              }
            });

            await chrome.storage.local.set({
              [FOLDERS_KEY]: mergedFolders,
              [PROMPTS_KEY]: mergedPrompts
            });
            alert('本地備份匯入與合併成功！');
          } else {
            alert('無效的備份檔案格式');
          }
        } catch (err) {
          alert('解析備份檔案失敗: ' + String(err));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleAuthClick = () => {
    if (syncState?.isAuthenticated) {
      if (window.confirm('確定要登出 Google Drive 嗎？')) {
        chrome.runtime.sendMessage({ type: 'cv.sync.signOut' }, (res) => {
          if (res && res.ok) {
            fetchSyncState();
          }
        });
      }
    } else {
      chrome.runtime.sendMessage({ type: 'cv.sync.authenticate', payload: { interactive: true } }, (res) => {
        if (res && res.ok) {
          fetchSyncState();
        }
      });
    }
  };

  const handleSyncClick = () => {
    if (!syncState?.isAuthenticated) {
      chrome.runtime.sendMessage({ type: 'cv.sync.authenticate', payload: { interactive: true } }, (res) => {
        if (res && res.ok) {
          fetchSyncState();
        }
      });
      return;
    }

    setSyncState(prev => prev ? { ...prev, isSyncing: true } : null);

    chrome.runtime.sendMessage({ type: 'cv.sync.download' }, (response) => {
      if (response && response.ok && response.data) {
        const cloudFolders = response.data.folders?.data || [];
        const cloudPrompts = response.data.prompts?.items || [];

        chrome.storage.local.get([FOLDERS_KEY, PROMPTS_KEY], async (localRes) => {
          const localFolders = localRes[FOLDERS_KEY] || [];
          const localPrompts = localRes[PROMPTS_KEY] || [];

          const mergedFolders = mergeFoldersLocal(localFolders, cloudFolders);
          const localPromptMap = new Map(localPrompts.map((p: any) => [p.id, p]));
          const mergedPrompts = [...localPrompts];
          cloudPrompts.forEach((cp: any) => {
            if (!localPromptMap.has(cp.id)) {
              mergedPrompts.push(cp);
            }
          });

          await chrome.storage.local.set({
            [FOLDERS_KEY]: mergedFolders,
            [PROMPTS_KEY]: mergedPrompts
          });

          chrome.runtime.sendMessage({
            type: 'cv.sync.upload',
            payload: { folders: mergedFolders, prompts: mergedPrompts }
          }, (uploadRes) => {
            fetchSyncState();
            if (uploadRes && uploadRes.ok) {
              alert('雲端雙向同步完成！');
            } else {
              alert('雲端同步失敗：' + (uploadRes?.error || '未知錯誤'));
            }
          });
        });
      } else {
        chrome.storage.local.get([FOLDERS_KEY, PROMPTS_KEY], (localRes) => {
          const localFolders = localRes[FOLDERS_KEY] || [];
          const localPrompts = localRes[PROMPTS_KEY] || [];
          chrome.runtime.sendMessage({
            type: 'cv.sync.upload',
            payload: { folders: localFolders, prompts: localPrompts }
          }, (uploadRes) => {
            fetchSyncState();
            if (uploadRes && uploadRes.ok) {
              alert('本地方案已上傳並與雲端完成同步！');
            } else {
              alert('同步失敗：' + (uploadRes?.error || '未知錯誤'));
            }
          });
        });
      }
    });
  };

  const handleSettingsClick = () => {
    window.open(chrome.runtime.getURL('src/pages/options/index.html'), '_blank');
  };

  const handleLocalBackupClick = () => {
    const action = window.confirm('點選「確定」匯出本地方案備份檔案 (JSON)\n點選「取消」匯入並合併備份檔案 (JSON)');
    if (action) {
      exportLocalBackup();
    } else {
      importLocalBackup();
    }
  };

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ folderId: string; anchorRect: DOMRect } | null>(null);

  const handleCreateFolder = async () => {
    await addFolder(newFolderName);
    setIsCreatingFolder(false);
    setNewFolderName('');
  };

  const handleRenameStart = (folder: Folder) => {
    setEditingFolderId(folder.id);
    setEditingName(folder.name);
  };

  const handleRenameCommit = (folderId: string) => {
    void (async () => {
      await renameFolder(folderId, editingName);
      setEditingFolderId(null);
      setEditingName('');
    })();
  };

  const handleDeleteFolder = (folderId: string, anchorRect: DOMRect) => {
    setPendingDelete({ folderId, anchorRect });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    void removeFolder(pendingDelete.folderId);
    setPendingDelete(null);
  };

  const cancelDelete = () => {
    setPendingDelete(null);
  };

  const handleFolderDrop = (folderId: string, conversationId: string) => {
    void moveConversationToFolder(conversationId, folderId);
  };

  const handleCloseContextMenu = () => setContextMenu(null);

  const handleExportConversation = async (conversationId: string) => {
    const currentChatId = window.location.pathname.split('/chat/')?.[1] ?? '';
    if (conversationId === currentChatId) {
      try {
        const { extractConversationMessages } = await import('../../services/exportExtractors');
        const { formatContent } = await import('../../services/exportFormatters');
        const extracted = await extractConversationMessages();
        const text = formatContent(extracted.messages, 'markdown');
        const time = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `claude-export-${conversationId}-${time}.md`;
        
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (e) {
        console.error('Export failed:', e);
      }
    } else {
      sessionStorage.setItem('__pending_export', 'markdown');
      window.location.href = `/chat/${conversationId}`;
    }
  };

  if (!isSidebarOpen) return null;
  if (!portalContainer) return null;

  return createPortal(
    <div className={`text-sm ${theme.rootText}`}>
      <div className="flex items-center justify-between px-2 py-1 mb-1 border-b border-black/5 dark:border-white/5 pb-2">
        <div className={`text-xs font-medium ${theme.headerText}`}>{t('folders.title')}</div>
        <div className="flex items-center gap-1.5">
          {/* 1. Google Drive Auth (User Profile) */}
          <button
            type="button"
            className={`rounded-md p-1 transition-colors ${theme.icon} ${theme.iconHoverBg} ${syncState?.isAuthenticated ? 'text-emerald-500 hover:text-emerald-400' : ''}`}
            onClick={handleAuthClick}
            title={syncState?.isAuthenticated ? '已連結 Google Drive (點擊登出)' : '連結 Google Drive'}
          >
            <User className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {/* 2. Local Backup (FolderOpen) */}
          <button
            type="button"
            className={`rounded-md p-1 transition-colors ${theme.icon} ${theme.iconHoverBg}`}
            onClick={handleLocalBackupClick}
            title="本地備份與還原 (匯出/匯入)"
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {/* 3. Cloud Sync (Cloud / RefreshCw) */}
          <button
            type="button"
            className={`rounded-md p-1 transition-colors ${theme.icon} ${theme.iconHoverBg} ${syncState?.isSyncing ? 'animate-spin text-amber-500' : ''}`}
            onClick={handleSyncClick}
            title={syncState?.isSyncing ? '雲端同步中...' : '與 Google Drive 雙向同步'}
            disabled={syncState?.isSyncing}
          >
            {syncState?.isSyncing ? (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          {/* 4. Options / Settings (Settings) */}
          <button
            type="button"
            className={`rounded-md p-1 transition-colors ${theme.icon} ${theme.iconHoverBg}`}
            onClick={handleSettingsClick}
            title="開啟選項設定頁面"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {/* 5. New Folder (Plus) */}
          <button
            type="button"
            className={`rounded-md p-1 transition-colors ${theme.icon} ${theme.iconHoverBg}`}
            onClick={() => {
              setIsCreatingFolder((v) => !v);
              setNewFolderName('');
            }}
            aria-label={t('folders.newFolderAria')}
            title={t('folders.newFolderAria')}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {isCreatingFolder ? (
        <div className="mb-2 flex items-center gap-2 px-2">
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className={`w-full rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1 ${theme.input}`}
            placeholder={t('folders.folderName')}
            aria-label={t('folders.folderName')}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              void handleCreateFolder();
            }}
            autoFocus
          />
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-xs transition-colors ${theme.rootText} ${theme.hoverBg}`}
            onClick={() => void handleCreateFolder()}
            aria-label={t('folders.createFolderAria')}
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-xs transition-colors ${theme.mutedText} ${theme.hoverBg}`}
            onClick={() => {
              setIsCreatingFolder(false);
              setNewFolderName('');
            }}
            aria-label={t('folders.cancelCreateAria')}
          >
            {t('common.cancel')}
          </button>
        </div>
      ) : null}

      <div className="mt-1">
        <FolderList
          folders={folders}
          theme={theme}
          conversationIndex={conversationIndex}
          conversationTitleIndex={conversationTitleIndex}
          editingFolderId={editingFolderId}
          editingName={editingName}
          onEditingNameChange={setEditingName}
          onRenameStart={handleRenameStart}
          onRenameCommit={handleRenameCommit}
          onDelete={handleDeleteFolder}
          onToggleExpanded={(folderId) => void toggleExpanded(folderId)}
          onDropConversationToFolder={handleFolderDrop}
          onConversationContextMenu={handleConversationContextMenu}
        />
      </div>

      <div className="mt-3 pt-2 border-t border-black/10 dark:border-white/10">
        <MultiAISidebarTree currentPlatform="claude" theme={isDarkTheme ? "dark" : "light"} />
      </div>

      <FolderManagerModals
        folders={folders}
        isDarkTheme={isDarkTheme}
        theme={theme}
        contextMenu={contextMenu}
        onContextMenuClose={handleCloseContextMenu}
        onMoveConversationToFolder={(conversationId, folderId) => moveConversationToFolder(conversationId, folderId)}
        onExportConversation={handleExportConversation}
        deleteTarget={pendingDelete}
        onDeleteConfirm={confirmDelete}
        onDeleteCancel={cancelDelete}
      />
    </div>,
    portalContainer,
  );
}

