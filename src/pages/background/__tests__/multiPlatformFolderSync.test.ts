import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type PlatformFolderSyncService,
  handlePlatformFolderSyncMessage,
  syncAllPlatformFolders,
} from '../multiPlatformFolderSync';

const STATE = { mode: 'manual' } as unknown as Awaited<
  ReturnType<PlatformFolderSyncService['getState']>
>;

function createService(cloud: Partial<Record<string, unknown[] | null>> = {}) {
  const service = {
    getState: vi.fn().mockResolvedValue(STATE),
    uploadClaudeFolders: vi.fn().mockResolvedValue(true),
    uploadChatGPTFolders: vi.fn().mockResolvedValue(true),
    uploadGeminiFolders: vi.fn().mockResolvedValue(true),
    uploadGrokFolders: vi.fn().mockResolvedValue(true),
    downloadClaudeFolders: vi.fn().mockResolvedValue(cloud.claude ?? null),
    downloadChatGPTFolders: vi.fn().mockResolvedValue(cloud.chatgpt ?? null),
    downloadGeminiFolders: vi.fn().mockResolvedValue(cloud.gemini ?? null),
    downloadGrokFolders: vi.fn().mockResolvedValue(cloud.grok ?? null),
  };
  return service satisfies PlatformFolderSyncService;
}

describe('handlePlatformFolderSyncMessage', () => {
  it.each([
    ['cv.sync.upload', 'uploadClaudeFolders'],
    ['nomad.sync.uploadClaude', 'uploadClaudeFolders'],
    ['nomad.sync.uploadChatGPT', 'uploadChatGPTFolders'],
    ['nomad.sync.uploadGemini', 'uploadGeminiFolders'],
    ['nomad.sync.uploadGrok', 'uploadGrokFolders'],
  ] as const)('routes %s to %s', async (type, method) => {
    const service = createService();
    const folders = [{ id: 'f1' }];

    const response = await handlePlatformFolderSyncMessage(service, {
      type,
      payload: { folders, interactive: false },
    });

    expect(service[method]).toHaveBeenCalledWith(folders, false);
    expect(response).toEqual({ ok: true, state: STATE });
  });

  it('defaults to interactive with an empty folder list', async () => {
    const service = createService();

    await handlePlatformFolderSyncMessage(service, {
      type: 'nomad.sync.uploadGrok',
    });

    expect(service.uploadGrokFolders).toHaveBeenCalledWith([], true);
  });

  it.each([
    ['cv.sync.download', 'downloadClaudeFolders'],
    ['nomad.sync.downloadClaude', 'downloadClaudeFolders'],
    ['nomad.sync.downloadChatGPT', 'downloadChatGPTFolders'],
    ['nomad.sync.downloadGemini', 'downloadGeminiFolders'],
    ['nomad.sync.downloadGrok', 'downloadGrokFolders'],
  ] as const)('routes %s to %s and returns the data', async (type, method) => {
    const service = createService();
    service[method].mockResolvedValue([{ id: 'cloud' }]);

    const response = await handlePlatformFolderSyncMessage(service, { type });

    expect(service[method]).toHaveBeenCalledWith(true);
    expect(response).toEqual({
      ok: true,
      data: [{ id: 'cloud' }],
      state: STATE,
    });
  });

  it('reports a failed download as not ok', async () => {
    const service = createService();

    const response = await handlePlatformFolderSyncMessage(service, {
      type: 'nomad.sync.downloadClaude',
    });

    expect(response).toEqual({ ok: false, data: null, state: STATE });
  });
});

describe('syncAllPlatformFolders', () => {
  let local: Record<string, unknown>;
  let tabMessages: number[];

  beforeEach(() => {
    local = {};
    tabMessages = [];
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ ...local })),
          set: vi.fn(async (items: Record<string, unknown>) => Object.assign(local, items)),
        },
      },
      tabs: {
        query: vi.fn(async () => [{ id: 1 }, { id: 2 }, {}]),
        sendMessage: vi.fn(async (id: number) => {
          tabMessages.push(id);
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('merges cloud and local folders, saves locally, uploads and notifies tabs', async () => {
    local = {
      claude_nexus_folders: [{ id: 'local-claude', name: 'L', updatedAt: 1 }],
      gvFolderData: { folders: [], folderContents: {} },
    };
    const service = createService({
      claude: [{ id: 'cloud-claude', name: 'C', updatedAt: 2 }],
      grok: {
        folders: [{ id: 'cloud-grok', name: 'G', updatedAt: 3 }],
      } as unknown as unknown[],
    });

    const result = await syncAllPlatformFolders(service, false);

    const ids = (list: unknown) => (list as { id: string }[]).map((f) => f.id).sort();
    expect(ids(result.claude)).toEqual(['cloud-claude', 'local-claude']);
    expect(ids(result.grok)).toEqual(['cloud-grok']);
    expect(result.chatgpt).toEqual([]);
    expect(local.claude_nexus_folders).toBe(result.claude);
    expect(local.grok_folders).toBe(result.grok);
    expect(service.uploadClaudeFolders).toHaveBeenCalledWith(result.claude, false);
    expect(service.uploadGeminiFolders).toHaveBeenCalledWith(result.gemini.folders, false);
    expect(tabMessages).toEqual([1, 2]);
  });

  it('keeps local data for platforms whose cloud download failed', async () => {
    local = { chatgpt_folders: [{ id: 'keep', name: 'K', updatedAt: 1 }] };
    const service = createService();

    const result = await syncAllPlatformFolders(service, true);

    expect(result.chatgpt).toEqual([{ id: 'keep', name: 'K', updatedAt: 1 }]);
    expect(result.gemini).toEqual({ folders: [], folderContents: {} });
  });
});
