import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SyncState } from '@/core/types/sync';
import { DEFAULT_SYNC_STATE } from '@/core/types/sync';

import { MultiPlatformSyncDashboard } from '../MultiPlatformSyncDashboard';

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    setLanguage: vi.fn(),
    t: (key: string) => key,
  }),
}));

const formatUpload = (time: number | null) => `up:${time ?? 'never'}`;
const formatSync = (time: number | null) => `down:${time ?? 'never'}`;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(syncState: SyncState): HTMLElement {
  act(() => {
    root.render(
      <MultiPlatformSyncDashboard
        syncState={syncState}
        formatLastUpload={formatUpload}
        formatLastSync={formatSync}
      />,
    );
  });
  return container.querySelector<HTMLElement>('[data-testid="sync-multi-platform-dashboard"]')!;
}

function tileTexts(dashboard: HTMLElement): string[] {
  return [...dashboard.querySelectorAll('.grid > div')].map((tile) => tile.textContent ?? '');
}

describe('MultiPlatformSyncDashboard', () => {
  it('shows one tile per platform with each platform’s own upload and sync times', () => {
    const dashboard = render({
      ...DEFAULT_SYNC_STATE,
      lastUploadTime: 1,
      lastSyncTime: 2,
      lastUploadTimeClaude: 3,
      lastSyncTimeClaude: 4,
      lastUploadTimeChatGPT: 5,
      lastSyncTimeChatGPT: 6,
      lastUploadTimeGrok: 7,
      lastSyncTimeGrok: 8,
    });

    expect(tileTexts(dashboard)).toEqual([
      'Gemini↑ up:1↓ down:2',
      'Claude↑ up:3↓ down:4',
      'ChatGPT↑ up:5↓ down:6',
      'Grok↑ up:7↓ down:8',
    ]);
  });

  it('treats missing per-platform times as never synced', () => {
    const state: SyncState = { ...DEFAULT_SYNC_STATE };
    delete state.lastUploadTimeClaude;
    delete state.lastSyncTimeGrok;

    const texts = tileTexts(render(state));

    expect(texts[1]).toBe('Claude↑ up:never↓ down:never');
    expect(texts[3]).toBe('Grok↑ up:never↓ down:never');
  });

  it('falls back to the built-in title when the translation key is missing', () => {
    const dashboard = render(DEFAULT_SYNC_STATE);

    expect(dashboard.textContent).toContain('multiPlatformSyncOverview');
    expect(dashboard.textContent).toContain('Google Drive');
  });
});
