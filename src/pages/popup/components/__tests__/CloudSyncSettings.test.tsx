import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { CloudSyncSettings } from '../CloudSyncSettings';
import {
  baseState,
  createChromeMock,
  flushMicrotasks,
  type MockedChrome,
} from './cloudSyncTestHarness';

const browserTarget = vi.hoisted(() => ({ value: 'chrome' }));
const deleteSafariICloudBackup = vi.hoisted(() => vi.fn());

vi.mock('@/contexts/LanguageContext', () => ({
  useLanguage: () => ({
    language: 'en',
    setLanguage: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock('@/core/utils/browser', () => ({
  getVoyagerBuildTarget: () => browserTarget.value,
  isSafari: () => false,
}));

vi.mock('@/core/utils/safariICloudSync', () => ({
  deleteSafariICloudBackup,
}));

describe('CloudSyncSettings auth flow', () => {
  let container: HTMLDivElement;
  let root: Root;

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    browserTarget.value = 'chrome';
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('shows Gemini as a branded platform summary without decorative emoji text', async () => {
    const sendMessageMock = vi.fn().mockImplementation((message: { type?: string }) => {
      if (message.type === 'gv.sync.getState') {
        return Promise.resolve({ ok: true, state: baseState });
      }
      return Promise.resolve({ ok: true });
    });
    (globalThis as { chrome: MockedChrome }).chrome = createChromeMock(sendMessageMock);

    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();

    const summary = container.querySelector('[data-testid="sync-platform-summary"]');
    const logo = summary?.querySelector('img');

    expect(summary?.textContent).toContain('platformGemini');
    expect(summary?.textContent).not.toContain('✨');
    expect(logo?.getAttribute('src')).toContain('gemini_sparkle');
    expect(logo?.getAttribute('alt')).toBe('');
  });

  it('switches the platform summary artwork and label for AI Studio', async () => {
    const sendMessageMock = vi.fn().mockImplementation((message: { type?: string }) => {
      if (message.type === 'gv.sync.getState') {
        return Promise.resolve({ ok: true, state: baseState });
      }
      return Promise.resolve({ ok: true });
    });
    const chromeMock = createChromeMock(sendMessageMock);
    (chromeMock.tabs.query as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 2, url: 'https://aistudio.google.com/prompts/new_chat' },
    ]);
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();

    const summary = container.querySelector('[data-testid="sync-platform-summary"]');
    const logo = summary?.querySelector('img');

    expect(summary?.textContent).toContain('platformAIStudio');
    expect(logo?.getAttribute('src')).toContain('/productlogos/ai_studio/');
  });

  it('lets Safari users select iCloud without changing the sync mode', async () => {
    browserTarget.value = 'safari';
    const sendMessageMock = vi.fn().mockImplementation((message: { type?: string }) => {
      if (message.type === 'gv.sync.getState') {
        return Promise.resolve({ ok: true, state: baseState });
      }
      if (message.type === 'gv.sync.setProvider') {
        return Promise.resolve({
          ok: true,
          state: { ...baseState, provider: 'icloud' },
        });
      }
      return Promise.resolve({ ok: true });
    });
    (globalThis as { chrome: MockedChrome }).chrome = createChromeMock(sendMessageMock);

    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();

    const iCloudButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'syncProviderICloud',
    );
    expect(iCloudButton).toBeDefined();
    await act(async () => {
      iCloudButton?.click();
    });

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: 'gv.sync.setProvider',
      payload: { provider: 'icloud' },
    });
    expect(container.textContent).toContain('cloudSyncDescriptionICloud');
  });

  it('gives unauthenticated Safari users a direct Google Drive connection link', async () => {
    browserTarget.value = 'safari';
    const sendMessageMock = vi.fn().mockImplementation((message: { type?: string }) => {
      if (message.type === 'gv.sync.getState') {
        return Promise.resolve({ ok: true, state: baseState });
      }
      return Promise.resolve({ ok: true });
    });
    (globalThis as { chrome: MockedChrome }).chrome = createChromeMock(sendMessageMock);

    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();

    const connectLink = container.querySelector<HTMLAnchorElement>(
      'a[href="gemini-voyager://google-drive-auth"]',
    );
    expect(connectLink?.textContent).toBe('syncConnectGoogleDrive');
  });

  it('lets Safari users delete their iCloud backup without deleting local data', async () => {
    browserTarget.value = 'safari';
    deleteSafariICloudBackup.mockResolvedValue(3);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const sendMessageMock = vi.fn().mockImplementation((message: { type?: string }) => {
      if (message.type === 'gv.sync.getState') {
        return Promise.resolve({ ok: true, state: { ...baseState, provider: 'icloud' } });
      }
      return Promise.resolve({ ok: true });
    });
    (globalThis as { chrome: MockedChrome }).chrome = createChromeMock(sendMessageMock);

    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();

    const deleteButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'syncDeleteICloudBackup',
    );
    expect(deleteButton).toBeDefined();
    await act(async () => {
      deleteButton?.click();
    });

    expect(deleteSafariICloudBackup).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('syncDeleteICloudSuccess');
  });

  it('loads and saves custom Google Drive client ID in local storage', async () => {
    const sendMessageMock = vi.fn().mockImplementation((message: { type?: string }) => {
      if (message.type === 'gv.sync.getState') {
        return Promise.resolve({ ok: true, state: baseState });
      }
      return Promise.resolve({ ok: true });
    });
    const chromeMock = createChromeMock(sendMessageMock);
    (chromeMock.storage.local.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      [StorageKeys.GOOGLE_CLIENT_ID]: 'custom-123.apps.googleusercontent.com',
    });
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();

    const input = container.querySelector(
      'input[placeholder="YOUR_CLIENT_ID.apps.googleusercontent.com"]',
    ) as HTMLInputElement | null;
    expect(input).toBeTruthy();
    expect(input?.value).toBe('custom-123.apps.googleusercontent.com');

    const saveBtn = input?.parentElement?.querySelector('button');
    expect(saveBtn).toBeTruthy();

    await act(async () => {
      if (input) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        )?.set;
        nativeSetter?.call(input, 'updated-456.apps.googleusercontent.com');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      saveBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const localSetMock = chromeMock.storage.local.set as unknown as ReturnType<typeof vi.fn>;
    expect(localSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        [StorageKeys.GOOGLE_CLIENT_ID]: 'updated-456.apps.googleusercontent.com',
      }),
    );
  });

  it('renders multi-AI cloud sync status overview dashboard and triggers sync all', async () => {
    const sendMessageMock = vi.fn().mockImplementation((message: { type?: string }) => {
      if (message.type === 'gv.sync.getState') {
        return Promise.resolve({
          ok: true,
          state: {
            ...baseState,
            lastUploadTime: 1700000000000,
            lastSyncTime: 1700000000000,
            lastUploadTimeClaude: 1700000000000,
            lastSyncTimeClaude: 1700000000000,
            lastUploadTimeChatGPT: 1700000000000,
            lastSyncTimeChatGPT: 1700000000000,
          },
        });
      }
      if (message.type === 'nomad.sync.syncAll') {
        return Promise.resolve({
          ok: true,
          state: {
            ...baseState,
            lastUploadTimeClaude: 1700001000000,
            lastSyncTimeClaude: 1700001000000,
          },
        });
      }
      return Promise.resolve({ ok: true });
    });

    const chromeMock = createChromeMock(sendMessageMock);
    (globalThis as { chrome: MockedChrome }).chrome = chromeMock;

    await act(async () => {
      root = createRoot(container);
      root.render(<CloudSyncSettings />);
    });
    await flushMicrotasks();

    const dashboard = container.querySelector('[data-testid="sync-multi-platform-dashboard"]');
    expect(dashboard).toBeTruthy();
    expect(dashboard?.textContent).toContain('Gemini');
    expect(dashboard?.textContent).toContain('Claude');
    expect(dashboard?.textContent).toContain('ChatGPT');

    const syncAllBtn = container.querySelector(
      '[data-testid="sync-all-platforms-button"]',
    ) as HTMLButtonElement | null;
    expect(syncAllBtn).toBeTruthy();

    await act(async () => {
      syncAllBtn?.click();
    });
    await flushMicrotasks();

    expect(sendMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'nomad.sync.syncAll' }),
    );
  });
});
