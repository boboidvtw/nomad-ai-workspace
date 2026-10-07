import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SyncState } from '@/core/types/sync';

type MockedChrome = typeof chrome;

function createChromeMock(): MockedChrome {
  const area = () => ({
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  });
  return {
    storage: {
      local: area(),
      sync: area(),
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      lastError: null,
      id: 'test-extension-id',
      getManifest: vi.fn(() => ({})),
    },
    identity: { getAuthToken: vi.fn(), removeCachedAuthToken: vi.fn() },
  } as unknown as MockedChrome;
}

async function createService() {
  (globalThis as { chrome: MockedChrome }).chrome = createChromeMock();
  vi.resetModules();
  const { GoogleDriveSyncService } = await import('../GoogleDriveSyncService');
  const service = new GoogleDriveSyncService();
  vi.spyOn(service as any, 'getAuthToken').mockResolvedValue('token');
  vi.spyOn(service as any, 'ensurePlatformSubfolder').mockImplementation(
    async (_token, name) => `${name}-subfolder`,
  );
  return service;
}

function mockFetchJson(payload: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => payload,
  } as Response);
}

const PLATFORMS = [
  {
    name: 'Claude',
    upload: 'uploadClaudeFolders',
    download: 'downloadClaudeFolders',
    file: 'claude-folders.json',
    uploadKey: 'lastUploadTimeClaude',
    syncKey: 'lastSyncTimeClaude',
  },
  {
    name: 'ChatGPT',
    upload: 'uploadChatGPTFolders',
    download: 'downloadChatGPTFolders',
    file: 'chatgpt-folders.json',
    uploadKey: 'lastUploadTimeChatGPT',
    syncKey: 'lastSyncTimeChatGPT',
  },
  {
    name: 'Gemini',
    upload: 'uploadGeminiFolders',
    download: 'downloadGeminiFolders',
    file: 'gemini-folders.json',
    uploadKey: 'lastUploadTime',
    syncKey: 'lastSyncTime',
  },
  {
    name: 'Grok',
    upload: 'uploadGrokFolders',
    download: 'downloadGrokFolders',
    file: 'grok-folders.json',
    uploadKey: 'lastUploadTimeGrok',
    syncKey: 'lastSyncTimeGrok',
  },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(PLATFORMS)('$name folder sync', (p) => {
  it('uploads into its platform subfolder and records the upload time', async () => {
    const service = await createService();
    const ensureFile = vi
      .spyOn(service as any, 'ensureSubfolderFileId')
      .mockResolvedValue('file-id');
    const upload = vi.spyOn(service as any, 'uploadFileWithRetry').mockResolvedValue(undefined);
    const folders = [{ id: 'f1' }];

    expect(await service[p.upload](folders)).toBe(true);

    expect(ensureFile).toHaveBeenCalledWith('token', `${p.name}-subfolder`, p.file);
    expect(upload).toHaveBeenCalledWith(
      'token',
      'file-id',
      expect.objectContaining({
        format: `nomad.${p.name.toLowerCase()}.folders.v1`,
        data: folders,
      }),
    );
    const state: SyncState = await service.getState();
    expect(state[p.uploadKey]).toEqual(expect.any(Number));
    expect(state.isSyncing).toBe(false);
  });

  it('downloads from its platform subfolder and records the sync time', async () => {
    const service = await createService();
    const find = vi.spyOn(service as any, 'findFileInFolder').mockResolvedValue('file-id');
    mockFetchJson({ data: [{ id: 'f1' }] });

    expect(await service[p.download]()).toEqual([{ id: 'f1' }]);

    expect(find).toHaveBeenCalledWith('token', `${p.name}-subfolder`, p.file);
    const state: SyncState = await service.getState();
    expect(state[p.syncKey]).toEqual(expect.any(Number));
  });

  it('returns an empty list when the payload has no data', async () => {
    const service = await createService();
    vi.spyOn(service as any, 'findFileInFolder').mockResolvedValue('file-id');
    mockFetchJson({});

    expect(await service[p.download]()).toEqual([]);
  });

  it('reports failure and sets the error when the upload throws', async () => {
    const service = await createService();
    vi.spyOn(service as any, 'ensureSubfolderFileId').mockResolvedValue('file-id');
    vi.spyOn(service as any, 'uploadFileWithRetry').mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await service[p.upload]([])).toBe(false);
    const state: SyncState = await service.getState();
    expect(state.error).toBe('boom');
    expect(state.isSyncing).toBe(false);
  });

  it('reports failure on a non-OK download response', async () => {
    const service = await createService();
    vi.spyOn(service as any, 'findFileInFolder').mockResolvedValue('file-id');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await service[p.download]()).toBeNull();
    expect((await service.getState()).error).toBe('Download failed with status: 500');
  });

  it('marks the service unauthenticated when no token is available', async () => {
    const service = await createService();
    vi.spyOn(service as any, 'getAuthToken').mockResolvedValue(null);

    expect(await service[p.upload]([])).toBe(false);
    expect(await service[p.download]()).toBeNull();
    expect((await service.getState()).isAuthenticated).toBe(false);
  });
});

describe('platform folder download when the file is missing', () => {
  it.each(PLATFORMS.filter((p) => p.name !== 'Gemini'))('returns null for $name', async (p) => {
    const service = await createService();
    vi.spyOn(service as any, 'findFileInFolder').mockResolvedValue(null);

    expect(await service[p.download]()).toBeNull();
  });

  it('falls back to the legacy root Gemini folders file', async () => {
    const service = await createService();
    vi.spyOn(service as any, 'ensureBackupFolder').mockResolvedValue('root-folder');
    const find = vi
      .spyOn(service as any, 'findFileInFolder')
      .mockImplementation(async (_token, parent) =>
        parent === 'root-folder' ? 'legacy-id' : null,
      );
    const fetchSpy = mockFetchJson({ folders: [{ id: 'legacy' }] });

    expect(await service.downloadGeminiFolders()).toEqual([{ id: 'legacy' }]);

    expect(find).toHaveBeenLastCalledWith('token', 'root-folder', 'gemini-voyager-folders.json');
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/files/legacy-id?alt=media');
    expect((await service.getState()).lastSyncTime).toEqual(expect.any(Number));
  });

  it('returns null when neither the Gemini subfolder nor the legacy file exists', async () => {
    const service = await createService();
    vi.spyOn(service as any, 'ensureBackupFolder').mockResolvedValue('root-folder');
    vi.spyOn(service as any, 'findFileInFolder').mockResolvedValue(null);

    expect(await service.downloadGeminiFolders()).toBeNull();
  });
});
