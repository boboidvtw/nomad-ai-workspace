import {
  GitHubRepoClient,
  getGitHubSyncConfigSummary,
  isGitHubSyncConfig,
  loadGitHubSyncConfig,
  saveGitHubSyncConfig,
} from '@/core/services/GitHubRepoClient';
import type { GoogleDriveSyncService } from '@/core/services/GoogleDriveSyncService';
import { GITHUB_SYNC_README, GITHUB_SYNC_README_PATH } from '@/core/services/githubRepoReadme';

import { reconcileTombstoneLedger } from './multiPlatformFolderSync';

type GitHubSyncMessage = {
  type: string;
  payload?: {
    owner?: unknown;
    repo?: unknown;
    branch?: unknown;
    token?: unknown;
    interactive?: unknown;
  };
};

type SyncService = Pick<
  GoogleDriveSyncService,
  'downloadTombstones' | 'uploadTombstones' | 'getState'
>;

const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/**
 * Save the repo settings after checking the repo is private and writable.
 * An empty token keeps the stored one, so the UI never needs to read it back.
 */
async function setConfig(payload: GitHubSyncMessage['payload']) {
  const stored = await loadGitHubSyncConfig();
  const config = {
    owner: trimmed(payload?.owner),
    repo: trimmed(payload?.repo),
    branch: trimmed(payload?.branch) || 'main',
    token: trimmed(payload?.token) || stored?.token || '',
  };
  if (!isGitHubSyncConfig(config)) {
    return { ok: false, error: 'Enter the owner, repository, branch and a token' };
  }
  try {
    const client = new GitHubRepoClient(config);
    await client.checkAccess();
    await client.writeTextIfMissing(
      GITHUB_SYNC_README_PATH,
      GITHUB_SYNC_README,
      'docs: describe the sync data layout',
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  await saveGitHubSyncConfig(config);
  return { ok: true, config: await getGitHubSyncConfigSummary() };
}

export async function handleGitHubSyncMessage(service: SyncService, message: GitHubSyncMessage) {
  switch (message.type) {
    case 'nomad.sync.github.getConfig':
      return { ok: true, config: await getGitHubSyncConfigSummary() };
    case 'nomad.sync.github.setConfig':
      return setConfig(message.payload);
    case 'nomad.sync.reconcileTombstones': {
      const interactive = message.payload?.interactive === true;
      const ledger = await reconcileTombstoneLedger(service, interactive);
      return { ok: true, ledger, state: await service.getState() };
    }
    default:
      throw new Error(`Not a GitHub sync message: ${message.type}`);
  }
}
