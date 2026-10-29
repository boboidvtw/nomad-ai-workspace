/**
 * Tests for the GitHub Contents API client used by the `github` sync provider.
 * fetch is replaced by a scripted fake so each request and response is explicit.
 */
import { describe, expect, it } from 'vitest';

import { GitHubRepoClient, GitHubSyncError, isGitHubSyncConfig } from '../GitHubRepoClient';

const config = { owner: 'me', repo: 'nomad-data', branch: 'main', token: 'fake-test-token' };

type Call = { url: string; method: string; body?: unknown; headers: Record<string, string> };
type Reply = { status: number; json?: unknown; text?: string };

function fakeFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const impl = async (url: string, init: RequestInit = {}) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(init.body as string) : undefined,
      headers: init.headers as Record<string, string>,
    });
    const reply = replies.shift();
    if (!reply) throw new Error(`Unexpected request ${url}`);
    return new Response(reply.text ?? JSON.stringify(reply.json ?? {}), { status: reply.status });
  };
  return { calls, impl: impl as typeof fetch };
}

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

describe('GitHubRepoClient.readJson', () => {
  it('decodes UTF-8 base64 content from the branch', async () => {
    const { calls, impl } = fakeFetch([
      { status: 200, json: { sha: 's1', encoding: 'base64', content: b64('{"name":"提示詞"}') } },
    ]);
    const client = new GitHubRepoClient(config, impl);
    await expect(client.readJson('Claude/claude-folders.json')).resolves.toEqual({
      name: '提示詞',
    });
    expect(calls[0].url).toBe(
      'https://api.github.com/repos/me/nomad-data/contents/Claude/claude-folders.json?ref=main',
    );
    expect(calls[0].headers.Authorization).toBe('Bearer fake-test-token');
  });

  it('returns null for a missing file', async () => {
    const { impl } = fakeFetch([{ status: 404 }]);
    await expect(new GitHubRepoClient(config, impl).readJson('x.json')).resolves.toBeNull();
  });

  it('falls back to the raw media type for files over 1 MB', async () => {
    const { calls, impl } = fakeFetch([
      { status: 200, json: { sha: 's1', encoding: 'none', content: '' } },
      { status: 200, text: '{"big":true}' },
    ]);
    await expect(new GitHubRepoClient(config, impl).readJson('big.json')).resolves.toEqual({
      big: true,
    });
    expect(calls[1].headers.Accept).toBe('application/vnd.github.raw+json');
  });

  it('re-reads a raw file that came back shorter than its reported size', async () => {
    const full = '{"big":true}';
    const { calls, impl } = fakeFetch([
      { status: 200, json: { sha: 's1', size: full.length, encoding: 'none', content: '' } },
      { status: 200, text: full.slice(0, 5) },
      { status: 200, text: full },
    ]);
    const client = new GitHubRepoClient(config, impl, 0);
    await expect(client.readJson('big.json')).resolves.toEqual({ big: true });
    expect(calls).toHaveLength(3);
  });

  it('raises an auth error on 401', async () => {
    const { impl } = fakeFetch([{ status: 401 }]);
    const error: GitHubSyncError = (await new GitHubRepoClient(config, impl)
      .readJson('x.json')
      .catch((e: GitHubSyncError) => e)) as GitHubSyncError;
    expect(error).toBeInstanceOf(GitHubSyncError);
    expect(error.isAuthError).toBe(true);
  });
});

describe('GitHubRepoClient.writeJson', () => {
  it('creates a missing file as a commit on the branch', async () => {
    const { calls, impl } = fakeFetch([{ status: 404 }, { status: 201, json: {} }]);
    const wrote = await new GitHubRepoClient(config, impl).writeJson('a.json', { v: 1 });
    expect(wrote).toBe(true);
    expect(calls[1].method).toBe('PUT');
    expect(calls[1].body).toMatchObject({ branch: 'main', content: b64('{\n  "v": 1\n}\n') });
    expect((calls[1].body as { sha?: string }).sha).toBeUndefined();
  });

  it('updates an existing file with its current sha', async () => {
    const { calls, impl } = fakeFetch([
      { status: 200, json: { sha: 'old', encoding: 'base64', content: b64('{"v":1}') } },
      { status: 200, json: {} },
    ]);
    await new GitHubRepoClient(config, impl).writeJson('a.json', { v: 2 });
    expect(calls[1].body).toMatchObject({ sha: 'old' });
  });

  it('skips the commit when only exportedAt changed', async () => {
    const remote = { exportedAt: '2026-01-01', data: [1] };
    const { calls, impl } = fakeFetch([
      { status: 200, json: { sha: 's', encoding: 'base64', content: b64(JSON.stringify(remote)) } },
    ]);
    const wrote = await new GitHubRepoClient(config, impl).writeJson('a.json', {
      exportedAt: '2026-10-29',
      data: [1],
    });
    expect(wrote).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it('re-reads the sha and retries when another device committed first', async () => {
    const { calls, impl } = fakeFetch([
      { status: 200, json: { sha: 'old', encoding: 'base64', content: b64('{"v":1}') } },
      { status: 409 },
      { status: 200, json: { sha: 'new', encoding: 'base64', content: b64('{"v":3}') } },
      { status: 200, json: {} },
    ]);
    await new GitHubRepoClient(config, impl).writeJson('a.json', { v: 2 });
    expect(calls[3].body).toMatchObject({ sha: 'new' });
  });
});

describe('GitHubRepoClient.checkAccess', () => {
  it('accepts a private repo the token can write to', async () => {
    const { impl } = fakeFetch([
      { status: 200, json: { private: true, permissions: { push: true }, default_branch: 'main' } },
    ]);
    await expect(new GitHubRepoClient(config, impl).checkAccess()).resolves.toBeUndefined();
  });

  it('refuses a public repo so synced data never becomes public', async () => {
    const { impl } = fakeFetch([
      { status: 200, json: { private: false, permissions: { push: true } } },
    ]);
    await expect(new GitHubRepoClient(config, impl).checkAccess()).rejects.toThrow(/private/);
  });

  it('refuses a token without write access', async () => {
    const { impl } = fakeFetch([
      { status: 200, json: { private: true, permissions: { push: false } } },
    ]);
    await expect(new GitHubRepoClient(config, impl).checkAccess()).rejects.toThrow(/write/);
  });
});

describe('isGitHubSyncConfig', () => {
  it('requires owner, repo, branch and token made of safe characters', () => {
    expect(isGitHubSyncConfig(config)).toBe(true);
    expect(isGitHubSyncConfig({ ...config, repo: '../etc' })).toBe(false);
    expect(isGitHubSyncConfig({ ...config, token: '' })).toBe(false);
  });
});
