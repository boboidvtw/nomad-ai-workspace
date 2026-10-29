/**
 * The `github` provider reuses the Drive sync flows but stores files in a
 * private repo at the same layout: root files at the repo root and
 * per-platform folders under `<Platform>/`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type MockedChrome = typeof chrome;

const CONFIG = { owner: 'me', repo: 'nomad-data', branch: 'main', token: 'fake-token' };

function createChromeMock(local: Record<string, unknown>): MockedChrome {
  return {
    storage: {
      local: {
        get: vi.fn(async () => ({ ...local })),
        set: vi.fn(async (items: Record<string, unknown>) => Object.assign(local, items)),
        remove: vi.fn(),
      },
      sync: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { lastError: null, id: 'test-extension-id', getManifest: vi.fn(() => ({})) },
    identity: { getAuthToken: vi.fn(), removeCachedAuthToken: vi.fn() },
  } as unknown as MockedChrome;
}

/** In-memory repo behind a fake Contents API. */
function mockGitHub(files: Record<string, string>) {
  const puts: string[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname.replace('/repos/me/nomad-data/contents/', ''));
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body)) as { content: string };
      files[path] = Buffer.from(body.content, 'base64').toString('utf8');
      puts.push(path);
      return new Response('{}', { status: 201 });
    }
    if (!(path in files)) return new Response('{}', { status: 404 });
    const content = Buffer.from(files[path], 'utf8').toString('base64');
    return new Response(JSON.stringify({ sha: `sha-${path}`, encoding: 'base64', content }), {
      status: 200,
    });
  });
  return puts;
}

async function createService(local: Record<string, unknown>) {
  (globalThis as { chrome: MockedChrome }).chrome = createChromeMock(local);
  vi.resetModules();
  const { GoogleDriveSyncService } = await import('../GoogleDriveSyncService');
  const service = new GoogleDriveSyncService();
  await service.getState();
  return service;
}

describe('GoogleDriveSyncService with the github provider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads the github provider from storage', async () => {
    const service = await createService({ gvSyncProvider: 'github' });
    expect((await service.getState()).provider).toBe('github');
  });

  it('writes per-platform folders under <Platform>/ in the repo', async () => {
    const files: Record<string, string> = {};
    const puts = mockGitHub(files);
    const service = await createService({
      gvSyncProvider: 'github',
      nomadGitHubSyncConfig: CONFIG,
    });

    await expect(service.uploadClaudeFolders([{ id: 'f1' }], false)).resolves.toBe(true);

    expect(puts).toEqual(['Claude/claude-folders.json']);
    expect(JSON.parse(files['Claude/claude-folders.json']).data).toEqual([{ id: 'f1' }]);
  });

  it('reads back what it wrote and returns null for a platform with no file', async () => {
    const files: Record<string, string> = {
      'Grok/grok-folders.json': JSON.stringify({ data: [{ id: 'g' }] }),
    };
    mockGitHub(files);
    const service = await createService({
      gvSyncProvider: 'github',
      nomadGitHubSyncConfig: CONFIG,
    });

    await expect(service.downloadGrokFolders(false)).resolves.toEqual([{ id: 'g' }]);
    await expect(service.downloadClaudeFolders(false)).resolves.toBeNull();
  });

  it('round-trips the tombstone file at Shared/sync-tombstones.json', async () => {
    const files: Record<string, string> = {};
    mockGitHub(files);
    const service = await createService({
      gvSyncProvider: 'github',
      nomadGitHubSyncConfig: CONFIG,
    });
    const tombstones = {
      format: 'nomad.sync.tombstones.v1' as const,
      datasets: { gvPromptItems: { 'prompt:p1': 5 } },
    };

    await expect(service.uploadTombstones(tombstones)).resolves.toBe(true);
    expect(Object.keys(files)).toEqual(['Shared/sync-tombstones.json']);
    await expect(service.downloadTombstones()).resolves.toEqual(tombstones);
  });

  it('does not sync before the repo is configured', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const service = await createService({ gvSyncProvider: 'github' });

    await expect(service.uploadClaudeFolders([], false)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
