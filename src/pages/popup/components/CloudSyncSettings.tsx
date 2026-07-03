import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, RefreshCw, Upload, Download, LogOut } from 'lucide-react';
import type { SyncState, SyncMode, SyncResponse, SyncData } from '@src/types/sync';
import type { Folder } from '@src/types/folder';
import type { Prompt } from '@src/types/prompt';
import { STORAGE_KEY as FOLDERS_KEY } from '@pages/content/services/storage';
import { PROMPT_LIBRARY_STORAGE_KEY as PROMPTS_KEY } from '@src/services/storage';

export function mergeFolders(local: Folder[], cloud: Folder[]): Folder[] {
  const localMap = new Map<string, Folder>(local.map((f) => [f.id, f]));
  const result: Folder[] = [...local];

  cloud.forEach((cloudFolder) => {
    const existing = localMap.get(cloudFolder.id);
    if (!existing) {
      result.push(cloudFolder);
    } else {
      // Merge conversation IDs
      const mergedConvIds = Array.from(
        new Set([...existing.conversationIds, ...cloudFolder.conversationIds])
      );
      const idx = result.findIndex((f) => f.id === cloudFolder.id);
      if (idx !== -1) {
        result[idx] = {
          ...existing,
          conversationIds: mergedConvIds,
        };
      }
    }
  });

  return result;
}

export function mergePrompts(local: Prompt[], cloud: Prompt[]): Prompt[] {
  const localMap = new Map<string, Prompt>(local.map((p) => [p.id, p]));
  const result: Prompt[] = [...local];

  cloud.forEach((cloudPrompt) => {
    if (!localMap.has(cloudPrompt.id)) {
      result.push(cloudPrompt);
    }
  });

  return result;
}

export function CloudSyncSettings() {
  const { t } = useTranslation();
  const [syncState, setSyncState] = useState<SyncState | null>(null);

  const fetchSyncState = useCallback(async () => {
    try {
      chrome.runtime.sendMessage({ type: 'cv.sync.getState' }, (response: SyncResponse) => {
        if (response && response.ok && response.state) {
          setSyncState(response.state);
        }
      });
    } catch (e) {
      console.warn('[CloudSyncSettings] Failed to fetch sync state:', e);
    }
  }, []);

  useEffect(() => {
    void fetchSyncState();
  }, [fetchSyncState]);

  const handleConnect = async () => {
    chrome.runtime.sendMessage(
      { type: 'cv.sync.authenticate', payload: { interactive: true } },
      (response: SyncResponse) => {
        if (response && response.state) {
          setSyncState(response.state);
        }
      }
    );
  };

  const handleDisconnect = async () => {
    chrome.runtime.sendMessage({ type: 'cv.sync.signOut' }, (response: SyncResponse) => {
      if (response && response.state) {
        setSyncState(response.state);
      }
    });
  };

  const handleModeChange = async (mode: SyncMode) => {
    chrome.runtime.sendMessage(
      { type: 'cv.sync.setMode', payload: { mode } },
      (response: SyncResponse) => {
        if (response && response.state) {
          setSyncState(response.state);
        }
      }
    );
  };

  const handleUpload = async () => {
    if (!syncState) return;
    setSyncState((prev) => (prev ? { ...prev, isSyncing: true, error: null } : null));

    chrome.storage.local.get([FOLDERS_KEY, PROMPTS_KEY], (result) => {
      const folders = (result[FOLDERS_KEY] as Folder[]) || [];
      const prompts = (result[PROMPTS_KEY] as Prompt[]) || [];

      chrome.runtime.sendMessage(
        {
          type: 'cv.sync.upload',
          payload: { folders, prompts, interactive: true },
        },
        (response: SyncResponse) => {
          if (response && response.state) {
            setSyncState(response.state);
          }
        }
      );
    });
  };

  const handleDownload = async (mode: 'merge' | 'overwrite') => {
    if (!syncState) return;

    if (mode === 'overwrite') {
      const confirmOverwrite = window.confirm(t('sync.overwriteConfirm'));
      if (!confirmOverwrite) return;
    }

    setSyncState((prev) => (prev ? { ...prev, isSyncing: true, error: null } : null));

    chrome.runtime.sendMessage(
      { type: 'cv.sync.download', payload: { interactive: true } },
      (response: SyncResponse) => {
        if (!response || !response.ok || !response.data) {
          if (response && response.state) {
            setSyncState(response.state);
          } else {
            setSyncState((prev) =>
              prev ? { ...prev, isSyncing: false, error: 'Download failed' } : null
            );
          }
          return;
        }

        const cloudData: SyncData = response.data;
        const cloudFolders = cloudData.folders?.data || [];
        const cloudPrompts = cloudData.prompts?.items || [];

        if (mode === 'overwrite') {
          chrome.storage.local.set(
            {
              [FOLDERS_KEY]: cloudFolders,
              [PROMPTS_KEY]: cloudPrompts,
            },
            () => {
              if (response.state) {
                setSyncState(response.state);
              } else {
                setSyncState((prev) => (prev ? { ...prev, isSyncing: false } : null));
              }
            }
          );
        } else {
          chrome.storage.local.get([FOLDERS_KEY, PROMPTS_KEY], (localResult) => {
            const localFolders = (localResult[FOLDERS_KEY] as Folder[]) || [];
            const localPrompts = (localResult[PROMPTS_KEY] as Prompt[]) || [];

            const mergedFolders = mergeFolders(localFolders, cloudFolders);
            const mergedPrompts = mergePrompts(localPrompts, cloudPrompts);

            chrome.storage.local.set(
              {
                [FOLDERS_KEY]: mergedFolders,
                [PROMPTS_KEY]: mergedPrompts,
              },
              () => {
                if (response.state) {
                  setSyncState(response.state);
                } else {
                  setSyncState((prev) => (prev ? { ...prev, isSyncing: false } : null));
                }
              }
            );
          });
        }
      }
    );
  };

  const formatTimestamp = (timestamp: number | null): string => {
    if (!timestamp) return t('sync.neverUploaded');
    return new Date(timestamp).toLocaleString();
  };

  if (!syncState) {
    return <div className="py-2 text-[12px] text-[#6B6B6B]">{t('promptLibrary.loading')}</div>;
  }

  return (
    <div className="mt-4 border-t border-[#E5E0D8] pt-3">
      <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1A1A1A]">
        <Cloud size={15} className="text-[#6B6B6B]" />
        <span>{t('sync.title')}</span>
      </div>
      <p className="mt-1 text-[11px] text-[#6B6B6B]">{t('sync.description')}</p>

      {!syncState.isAuthenticated ? (
        <button
          onClick={handleConnect}
          disabled={syncState.isSyncing}
          className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded bg-[#1A1A1A] py-1.5 text-[12px] font-medium text-white hover:bg-[#333333] disabled:opacity-50"
        >
          <Cloud size={14} />
          <span>{t('sync.connect')}</span>
        </button>
      ) : (
        <div className="mt-2.5 space-y-2">
          {/* Connection status and Disconnect */}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#2E7D32] font-medium">✓ Connected to Google Drive</span>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-0.5 text-[#C62828] hover:underline"
            >
              <LogOut size={10} />
              <span>{t('sync.disconnect')}</span>
            </button>
          </div>

          {/* Sync Mode selector */}
          <div className="flex items-center justify-between text-[12px] gap-2">
            <span className="text-[#1A1A1A]">{t('sync.mode')}</span>
            <select
              value={syncState.mode}
              onChange={(e) => handleModeChange(e.target.value as SyncMode)}
              className="rounded bg-[#EFEFED] px-1.5 py-0.5 text-[11px] text-[#1A1A1A] border border-[#E5E0D8]"
            >
              <option value="disabled">{t('sync.modeDisabled')}</option>
              <option value="manual">{t('sync.modeManual')}</option>
              <option value="auto">{t('sync.modeAuto')}</option>
            </select>
          </div>

          {/* Timestamp status */}
          <div className="text-[10px] text-[#6B6B6B] space-y-0.5">
            <div>
              {t('sync.lastUploaded', { time: formatTimestamp(syncState.lastUploadTime) })}
            </div>
            <div>
              {t('sync.lastSynced', { time: formatTimestamp(syncState.lastSyncTime) })}
            </div>
          </div>

          {/* Sync Actions */}
          <div className="grid grid-cols-3 gap-1 pt-1">
            <button
              onClick={handleUpload}
              disabled={syncState.isSyncing}
              className="flex flex-col items-center justify-center gap-1 rounded bg-[#EFEFED] py-1.5 text-[10px] text-[#1A1A1A] border border-[#E5E0D8] hover:bg-[#E5E0D8] disabled:opacity-50"
              title={t('sync.syncNow')}
            >
              <Upload size={13} />
              <span>Upload</span>
            </button>

            <button
              onClick={() => handleDownload('merge')}
              disabled={syncState.isSyncing}
              className="flex flex-col items-center justify-center gap-1 rounded bg-[#EFEFED] py-1.5 text-[10px] text-[#1A1A1A] border border-[#E5E0D8] hover:bg-[#E5E0D8] disabled:opacity-50"
              title={t('sync.syncMerge')}
            >
              <RefreshCw size={13} className={syncState.isSyncing ? 'animate-spin' : ''} />
              <span>Merge</span>
            </button>

            <button
              onClick={() => handleDownload('overwrite')}
              disabled={syncState.isSyncing}
              className="flex flex-col items-center justify-center gap-1 rounded bg-[#EFEFED] py-1.5 text-[10px] text-[#1A1A1A] border border-[#E5E0D8] hover:bg-[#E5E0D8] disabled:opacity-50"
              title={t('sync.syncOverwrite')}
            >
              <Download size={13} />
              <span>Overwrite</span>
            </button>
          </div>
        </div>
      )}

      {/* Syncing indicator */}
      {syncState.isSyncing && (
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-[#6B6B6B]">
          <RefreshCw size={12} className="animate-spin text-[#1A1A1A]" />
          <span>{t('sync.syncing')}</span>
        </div>
      )}

      {/* Error state */}
      {syncState.error && (
        <div className="mt-2 rounded bg-[#FFEBEE] p-1.5 text-[11px] text-[#C62828] border border-[#FFCDD2] break-words">
          {syncState.error}
        </div>
      )}
    </div>
  );
}
