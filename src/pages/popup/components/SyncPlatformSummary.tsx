import React from 'react';

import type { SyncPlatform } from '@/core/types/sync';

import { useLanguage } from '../../../contexts/LanguageContext';

type FormatTime = (time: number | null) => string;

const PLATFORM_LOGO_URLS: Record<SyncPlatform, string> = {
  gemini: 'https://www.gstatic.com/lamda/images/gemini_sparkle_4g_512_lt_f94943af3be039176192d.png',
  aistudio:
    'https://www.gstatic.com/images/branding/productlogos/ai_studio/v1/web-512dp/logo_ai_studio_color_1x_web_512dp.png',
};

interface SyncPlatformSummaryProps {
  platform: SyncPlatform;
  lastUploadTime: number | null;
  lastSyncTime: number | null;
  formatLastUpload: FormatTime;
  formatLastSync: FormatTime;
}

/** Current platform's label, last upload/sync times and a faint platform logo. */
export function SyncPlatformSummary({
  platform,
  lastUploadTime,
  lastSyncTime,
  formatLastUpload,
  formatLastSync,
}: SyncPlatformSummaryProps) {
  const { t } = useLanguage();

  return (
    <div
      data-testid="sync-platform-summary"
      className="border-border/60 bg-muted/25 relative isolate overflow-hidden rounded-xl border px-3 py-2.5"
    >
      <div className="relative z-10 min-w-0 pe-14">
        <p className="text-foreground/75 mb-1.5 flex min-w-0 items-center gap-1.5 text-xs font-semibold">
          <span aria-hidden="true" className="bg-primary/70 size-1.5 shrink-0 rounded-full" />
          <span className="sr-only">{t('currentPlatform')}: </span>
          <span className="min-w-0 break-words">
            {t(platform === 'aistudio' ? 'platformAIStudio' : 'platformGemini')}
          </span>
        </p>

        <div className="text-muted-foreground grid min-w-0 gap-1 text-xs leading-snug">
          <p className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-1.5">
            <span aria-hidden="true" className="text-foreground/45">
              ↑
            </span>
            <span className="min-w-0 break-words">{formatLastUpload(lastUploadTime)}</span>
          </p>
          <p className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-1.5">
            <span aria-hidden="true" className="text-foreground/45">
              ↓
            </span>
            <span className="min-w-0 break-words">{formatLastSync(lastSyncTime)}</span>
          </p>
        </div>
      </div>

      <div
        aria-hidden="true"
        data-testid="sync-platform-mark"
        className="pointer-events-none absolute inset-y-0 end-0 flex w-20 items-center justify-center overflow-hidden"
      >
        <div className="bg-primary/10 absolute inset-3 rounded-full blur-xl" />
        <img
          src={PLATFORM_LOGO_URLS[platform]}
          alt=""
          draggable={false}
          className="size-16 object-contain opacity-[0.13] saturate-75 select-none dark:opacity-[0.2] dark:saturate-100"
        />
      </div>
    </div>
  );
}
