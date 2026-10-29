/**
 * Minimal GitHub Contents API client for the `github` sync provider.
 *
 * Sync files live in a private repo the user owns, at the same paths as the
 * Google Drive layout (`<file>.json` at the root, `<Platform>/<file>.json` for
 * per-platform folders). Every changed write is one commit, so git history is
 * the version history. Uses a fine-grained personal access token limited to
 * that repo (Contents: read and write).
 *
 * The Contents API rejects parallel writes to one branch, so writes are queued
 * per client and run one at a time.
 */

const GITHUB_API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';
const MAX_WRITE_ATTEMPTS = 3;
const MAX_RAW_READ_ATTEMPTS = 3;
const RAW_READ_RETRY_DELAY_MS = 1000;
const NAME_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;
const BRANCH_PATTERN = /^[A-Za-z0-9_./-]{1,200}$/;

export const GITHUB_SYNC_CONFIG_KEY = 'nomadGitHubSyncConfig';

export interface GitHubSyncConfig {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export function isGitHubSyncConfig(value: unknown): value is GitHubSyncConfig {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config.owner === 'string' &&
    NAME_PATTERN.test(config.owner) &&
    typeof config.repo === 'string' &&
    NAME_PATTERN.test(config.repo) &&
    !config.repo.startsWith('.') &&
    typeof config.branch === 'string' &&
    BRANCH_PATTERN.test(config.branch) &&
    !config.branch.includes('..') &&
    typeof config.token === 'string' &&
    config.token.trim().length > 0
  );
}

export class GitHubSyncError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'GitHubSyncError';
    this.status = status;
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export function isGitHubAuthError(error: unknown): boolean {
  return error instanceof GitHubSyncError && error.isAuthError;
}

type RemoteFile = { sha: string; text: string };

function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Payload JSON without the per-upload timestamp, for "did anything change" checks. */
function comparableJson(text: string): string | null {
  try {
    const value = JSON.parse(text);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const { exportedAt: _ignored, ...rest } = value as Record<string, unknown>;
      return JSON.stringify(rest);
    }
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

export class GitHubRepoClient {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly config: GitHubSyncConfig,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args),
    private readonly rawRetryDelayMs: number = RAW_READ_RETRY_DELAY_MS,
  ) {}

  /** Throws unless the repo exists, is private and the token can push to it. */
  async checkAccess(): Promise<void> {
    const response = await this.request(this.repoUrl());
    if (!response.ok) throw this.errorFor(response, 'Cannot open the repository');
    const repo = (await response.json()) as { private?: boolean; permissions?: { push?: boolean } };
    if (repo.private !== true) {
      throw new GitHubSyncError('The sync repository must be private');
    }
    if (repo.permissions?.push !== true) {
      throw new GitHubSyncError('The token needs write access (Contents: read and write)');
    }
  }

  async readJson<T>(path: string): Promise<T | null> {
    const file = await this.readFile(path);
    return file ? (JSON.parse(file.text) as T) : null;
  }

  /**
   * Commit `data` to `path`. Returns false when the stored content is already
   * the same apart from `exportedAt`, so unchanged syncs add no commits.
   */
  writeJson(path: string, data: unknown, message?: string): Promise<boolean> {
    const text = `${JSON.stringify(data, null, 2)}\n`;
    return this.enqueueWrite(path, text, message ?? `sync: update ${path}`, (current) => {
      return comparableJson(current) === comparableJson(text);
    });
  }

  /** Commit a text file only if it does not exist yet. Returns whether it was created. */
  writeTextIfMissing(path: string, text: string, message: string): Promise<boolean> {
    return this.enqueueWrite(path, text, message, () => true);
  }

  private enqueueWrite(
    path: string,
    text: string,
    message: string,
    isUnchanged: (currentText: string) => boolean,
  ): Promise<boolean> {
    const run = this.writeQueue.then(() => this.writeNow(path, text, message, isUnchanged));
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  private async writeNow(
    path: string,
    text: string,
    message: string,
    isUnchanged: (currentText: string) => boolean,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
      const current = await this.readFile(path);
      if (current && isUnchanged(current.text)) return false;

      const response = await this.request(this.contentsUrl(path), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          content: encodeBase64Utf8(text),
          branch: this.config.branch,
          ...(current ? { sha: current.sha } : {}),
        }),
      });
      if (response.ok) return true;
      // 409 / 422: another device committed since we read the sha. Re-read and retry.
      const isShaConflict = response.status === 409 || response.status === 422;
      if (!isShaConflict || attempt === MAX_WRITE_ATTEMPTS) {
        throw this.errorFor(response, `Failed to write ${path}`);
      }
    }
    return false;
  }

  private async readFile(path: string): Promise<RemoteFile | null> {
    const url = `${this.contentsUrl(path)}?ref=${encodeURIComponent(this.config.branch)}`;
    const response = await this.request(url);
    if (response.status === 404) return null;
    if (!response.ok) throw this.errorFor(response, `Failed to read ${path}`);

    const body = (await response.json()) as {
      sha?: string;
      size?: number;
      encoding?: string;
      content?: string;
    };
    if (typeof body.sha !== 'string') throw new GitHubSyncError(`${path} is not a file`);
    if (body.encoding === 'base64' && typeof body.content === 'string') {
      return { sha: body.sha, text: decodeBase64Utf8(body.content) };
    }

    // Files over 1 MB come back without inline content; fetch them raw.
    return { sha: body.sha, text: await this.readRaw(url, path, body.size) };
  }

  /**
   * Right after a write GitHub can serve a large raw file cut short (seen at
   * 256 KB), so check the byte length against the reported size and re-read.
   */
  private async readRaw(url: string, path: string, size: number | undefined): Promise<string> {
    for (let attempt = 1; attempt <= MAX_RAW_READ_ATTEMPTS; attempt++) {
      const raw = await this.request(url, {
        headers: { Accept: 'application/vnd.github.raw+json' },
      });
      if (!raw.ok) throw this.errorFor(raw, `Failed to read ${path}`);
      const text = await raw.text();
      if (typeof size !== 'number' || new TextEncoder().encode(text).length === size) return text;
      if (attempt < MAX_RAW_READ_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, this.rawRetryDelayMs));
      }
    }
    throw new GitHubSyncError(`Failed to read ${path}: incomplete download`);
  }

  private request(url: string, init: RequestInit = {}): Promise<Response> {
    return this.fetchImpl(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        ...(init.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${this.config.token}`,
      },
    });
  }

  private repoUrl(): string {
    const { owner, repo } = this.config;
    return `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  private contentsUrl(path: string): string {
    const encodedPath = path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    return `${this.repoUrl()}/contents/${encodedPath}`;
  }

  private errorFor(response: Response, prefix: string): GitHubSyncError {
    const hint =
      response.status === 401
        ? ' (token invalid or expired)'
        : response.status === 403
          ? ' (token lacks access or rate limited)'
          : response.status === 404
            ? ' (repository or branch not found)'
            : '';
    return new GitHubSyncError(`${prefix}: ${response.status}${hint}`, response.status);
  }
}

export async function loadGitHubSyncConfig(): Promise<GitHubSyncConfig | null> {
  const result = await chrome.storage.local.get(GITHUB_SYNC_CONFIG_KEY);
  const value = result?.[GITHUB_SYNC_CONFIG_KEY];
  return isGitHubSyncConfig(value) ? value : null;
}

export async function saveGitHubSyncConfig(config: GitHubSyncConfig): Promise<void> {
  await chrome.storage.local.set({ [GITHUB_SYNC_CONFIG_KEY]: config });
}

/** Repo settings safe to show in the UI: everything except the token. */
export async function getGitHubSyncConfigSummary(): Promise<{
  owner: string;
  repo: string;
  branch: string;
  hasToken: boolean;
} | null> {
  const result = await chrome.storage.local.get(GITHUB_SYNC_CONFIG_KEY);
  const value = result?.[GITHUB_SYNC_CONFIG_KEY] as Partial<GitHubSyncConfig> | undefined;
  if (!value || typeof value.owner !== 'string' || typeof value.repo !== 'string') return null;
  return {
    owner: value.owner,
    repo: value.repo,
    branch: typeof value.branch === 'string' ? value.branch : 'main',
    hasToken: typeof value.token === 'string' && value.token.length > 0,
  };
}

/** Forget the token but keep owner/repo/branch so reconnecting only needs a new token. */
export async function clearGitHubSyncToken(): Promise<void> {
  const result = await chrome.storage.local.get(GITHUB_SYNC_CONFIG_KEY);
  const value = result?.[GITHUB_SYNC_CONFIG_KEY];
  if (typeof value !== 'object' || value === null) return;
  await chrome.storage.local.set({ [GITHUB_SYNC_CONFIG_KEY]: { ...value, token: '' } });
}
