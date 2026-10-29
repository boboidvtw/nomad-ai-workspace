/**
 * Tests for the GitHub sync settings messages: validation, the private-repo
 * check, and that the stored token is kept but never returned to the UI.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleGitHubSyncMessage } from '../githubSyncMessages';

const service = {
  getState: vi.fn(),
  downloadTombstones: vi.fn().mockResolvedValue(null),
  uploadTombstones: vi.fn().mockResolvedValue(true),
};

describe('handleGitHubSyncMessage', () => {
  let local: Record<string, unknown>;
  let repoReply: { private: boolean; permissions: { push: boolean } };
  let puts: string[];

  beforeEach(() => {
    local = {};
    repoReply = { private: true, permissions: { push: true } };
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn(async () => ({ ...local })),
          set: vi.fn(async (items: Record<string, unknown>) => Object.assign(local, items)),
        },
      },
    });
    puts = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/repos/me/data')) {
          return new Response(JSON.stringify(repoReply), { status: 200 });
        }
        if (init?.method === 'PUT') {
          puts.push(url);
          return new Response('{}', { status: 201 });
        }
        return new Response('{}', { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const setConfig = (payload: Record<string, unknown>) =>
    handleGitHubSyncMessage(service, { type: 'nomad.sync.github.setConfig', payload });

  it('saves a checked config and returns it without the token', async () => {
    const response = await setConfig({ owner: 'me', repo: 'data', token: 'fake-token' });

    expect(response).toEqual({
      ok: true,
      config: { owner: 'me', repo: 'data', branch: 'main', hasToken: true },
    });
    expect(JSON.stringify(response)).not.toContain('fake-token');
    expect(puts).toEqual(['https://api.github.com/repos/me/data/contents/README.md']);
  });

  it('keeps the stored token when the form leaves it empty', async () => {
    local.nomadGitHubSyncConfig = { owner: 'me', repo: 'old', branch: 'main', token: 'kept' };

    await setConfig({ owner: 'me', repo: 'data', branch: 'main', token: '' });

    expect(local.nomadGitHubSyncConfig).toEqual({
      owner: 'me',
      repo: 'data',
      branch: 'main',
      token: 'kept',
    });
  });

  it('does not save a public repo', async () => {
    repoReply = { private: false, permissions: { push: true } };

    const response = await setConfig({ owner: 'me', repo: 'data', token: 'fake-token' });

    expect(response.ok).toBe(false);
    expect(local.nomadGitHubSyncConfig).toBeUndefined();
  });

  it('rejects an incomplete form without calling GitHub', async () => {
    const response = await setConfig({ owner: 'me', repo: '', token: 'fake-token' });

    expect(response.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
