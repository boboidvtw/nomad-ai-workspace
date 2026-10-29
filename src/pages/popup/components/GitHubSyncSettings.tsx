import React, { useEffect, useState } from 'react';

import type { SyncState } from '@/core/types/sync';

import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { useLanguage } from '../../../contexts/LanguageContext';

const GITHUB_API_ORIGIN = 'https://api.github.com/*';

/** False only when the user declines; browsers without the API fall back to CORS. */
async function requestGitHubApiAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.request({ origins: [GITHUB_API_ORIGIN] });
  } catch (error) {
    console.warn('[GitHubSyncSettings] Host permission request unavailable:', error);
    return true;
  }
}

type ConfigSummary = { owner: string; repo: string; branch: string; hasToken: boolean };

const INPUT_CLASS =
  'border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-8 w-full rounded-md border bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:ring-1 focus-visible:outline-none';

/**
 * Repo settings for the `github` sync provider. The token is write-only: the
 * background never sends it back, so the field stays empty once saved.
 */
export function GitHubSyncSettings({ onStateChange }: { onStateChange: (s: SyncState) => void }) {
  const { t } = useLanguage();
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const applySummary = (config: ConfigSummary | null) => {
    if (!config) return;
    setOwner(config.owner);
    setRepo(config.repo);
    setBranch(config.branch);
    setHasToken(config.hasToken);
  };

  useEffect(() => {
    void chrome.runtime
      .sendMessage({ type: 'nomad.sync.github.getConfig' })
      .then((response) => applySummary(response?.config ?? null))
      .catch((error) => console.warn('[GitHubSyncSettings] Failed to load config:', error));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      // Must run first, inside the click gesture. api.github.com is an optional
      // host so existing installs are not disabled by a new required permission.
      if (!(await requestGitHubApiAccess())) {
        setMessage({ text: t('syncError').replace('{error}', GITHUB_API_ORIGIN), ok: false });
        return;
      }
      const response = await chrome.runtime.sendMessage({
        type: 'nomad.sync.github.setConfig',
        payload: { owner, repo, branch, token },
      });
      if (!response?.ok) {
        setMessage({ text: t('syncError').replace('{error}', String(response?.error)), ok: false });
        return;
      }
      setToken('');
      applySummary(response.config);
      setMessage({
        text: t('githubSyncConnected').replace('{repo}', `${owner}/${repo}`),
        ok: true,
      });
      const auth = await chrome.runtime.sendMessage({
        type: 'gv.sync.authenticate',
        payload: { interactive: false },
      });
      if (auth?.state) onStateChange(auth.state);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), ok: false });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="border-border/70 bg-muted/30 space-y-2 rounded-lg border px-3 py-2">
      <p className="text-muted-foreground text-xs leading-snug">{t('githubSyncDescription')}</p>
      <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
        <Label htmlFor="github-sync-owner" className="text-xs">
          {t('githubSyncOwner')}
        </Label>
        <input
          id="github-sync-owner"
          className={INPUT_CLASS}
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          autoComplete="off"
        />
        <Label htmlFor="github-sync-repo" className="text-xs">
          {t('githubSyncRepo')}
        </Label>
        <input
          id="github-sync-repo"
          className={INPUT_CLASS}
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          autoComplete="off"
        />
        <Label htmlFor="github-sync-branch" className="text-xs">
          {t('githubSyncBranch')}
        </Label>
        <input
          id="github-sync-branch"
          className={INPUT_CLASS}
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          autoComplete="off"
        />
        <Label htmlFor="github-sync-token" className="text-xs">
          {t('githubSyncToken')}
        </Label>
        <input
          id="github-sync-token"
          type="password"
          className={INPUT_CLASS}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={hasToken ? t('githubSyncTokenSaved') : 'github_pat_…'}
          autoComplete="off"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-full text-xs"
        onClick={() => void handleSave()}
        disabled={isSaving}
      >
        {t('githubSyncSave')}
      </Button>
      {message && (
        <p className={`text-center text-xs ${message.ok ? 'text-green-600' : 'text-destructive'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
