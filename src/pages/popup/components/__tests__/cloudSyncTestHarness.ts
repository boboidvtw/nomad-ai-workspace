import { act } from 'react';

import { vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { SyncState } from '@/core/types/sync';
import { DEFAULT_SYNC_STATE } from '@/core/types/sync';

// Shared fixtures for the CloudSyncSettings test files. vi.mock calls stay in
// each test file because vitest hoists them per file.

export type MockedChrome = typeof chrome;

export const baseState: SyncState = {
  ...DEFAULT_SYNC_STATE,
  mode: 'manual',
  isAuthenticated: false,
};

export function createChromeMock(sendMessage: ReturnType<typeof vi.fn>): MockedChrome {
  return {
    runtime: {
      sendMessage,
      lastError: null,
      id: 'test-extension-id',
    },
    tabs: {
      get: vi.fn().mockResolvedValue({ id: 1, url: 'https://gemini.google.com/app' }),
      query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://gemini.google.com/app' }]),
      sendMessage: vi.fn().mockResolvedValue({
        ok: true,
        data: { folders: [], folderContents: {} },
      }),
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({
          gvFolderData: { folders: [], folderContents: {} },
          gvPromptItems: [],
          geminiTimelineStarredMessages: { messages: {} },
          [StorageKeys.TIMELINE_HIERARCHY]: { conversations: {} },
        }),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
      },
      sync: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        clear: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  } as unknown as MockedChrome;
}

export async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}
