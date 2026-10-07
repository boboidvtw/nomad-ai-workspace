import React from 'react';

import type { SyncState } from '@/core/types/sync';

import { useLanguage } from '../../../contexts/LanguageContext';

type FormatTime = (time: number | null) => string;

interface MultiPlatformSyncDashboardProps {
  syncState: SyncState;
  formatLastUpload: FormatTime;
  formatLastSync: FormatTime;
}

/** Which SyncState fields hold each platform's last upload (↑) and download (↓) time. */
const PLATFORM_TILES: ReadonlyArray<{
  label: string;
  upload: (state: SyncState) => number | null | undefined;
  sync: (state: SyncState) => number | null | undefined;
}> = [
  {
    label: 'Gemini',
    upload: (s) => s.lastUploadTime,
    sync: (s) => s.lastSyncTime,
  },
  {
    label: 'Claude',
    upload: (s) => s.lastUploadTimeClaude,
    sync: (s) => s.lastSyncTimeClaude,
  },
  {
    label: 'ChatGPT',
    upload: (s) => s.lastUploadTimeChatGPT,
    sync: (s) => s.lastSyncTimeChatGPT,
  },
  {
    label: 'Grok',
    upload: (s) => s.lastUploadTimeGrok,
    sync: (s) => s.lastSyncTimeGrok,
  },
];

/** Overview of the last Drive upload and download time for every synced AI platform. */
export function MultiPlatformSyncDashboard({
  syncState,
  formatLastUpload,
  formatLastSync,
}: MultiPlatformSyncDashboardProps) {
  const { t } = useLanguage();

  return (
    <div
      data-testid="sync-multi-platform-dashboard"
      className="border-border/60 bg-muted/20 space-y-2 rounded-xl border p-2.5"
    >
      <div className="flex items-center justify-between px-0.5">
        <span className="text-foreground/80 text-[11px] font-semibold tracking-wide uppercase">
          {(t as (k: string) => string)('multiPlatformSyncOverview') ||
            '多平台雲端同步狀態 (Multi-AI Status)'}
        </span>
        <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-emerald-500" />
          Google Drive
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {PLATFORM_TILES.map(({ label, upload, sync }) => {
          const uploadText = formatLastUpload(upload(syncState) ?? null);
          const syncText = formatLastSync(sync(syncState) ?? null);
          return (
            <div
              key={label}
              className="border-border/50 bg-background/50 rounded-lg border p-2 text-center shadow-xs"
            >
              <div className="text-foreground truncate text-[11px] font-medium">{label}</div>
              <div className="text-muted-foreground mt-1 flex flex-col gap-0.5 text-[10px]">
                <span title={uploadText}>↑ {uploadText}</span>
                <span title={syncText}>↓ {syncText}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
