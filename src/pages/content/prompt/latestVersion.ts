/**
 * Latest released version lookup for the prompt manager's update badge,
 * cached in local storage so GitHub is queried at most every few hours.
 */
import browser from 'webextension-polyfill';

import { logger } from '@/core/services/LoggerService';

const LATEST_VERSION_CACHE_KEY = 'nomadLatestVersionCache';
const LATEST_VERSION_MAX_AGE = 1000 * 60 * 60 * 6; // 6 hours

const pmLogger = logger.createChild('PromptManager');

export const normalizeVersionString = (version?: string | null): string | null => {
  if (!version) return null;
  const trimmed = version.trim();
  return trimmed ? trimmed.replace(/^v/i, '') : null;
};

export async function getLatestVersionCached(): Promise<string | null> {
  try {
    if (!browser.runtime?.id) return null;

    const now = Date.now();
    const cache = await browser.storage.local.get(LATEST_VERSION_CACHE_KEY);
    const cached = cache?.[LATEST_VERSION_CACHE_KEY] as
      | { version?: string; fetchedAt?: number }
      | undefined;
    if (
      cached &&
      cached.version &&
      cached.fetchedAt &&
      now - cached.fetchedAt < LATEST_VERSION_MAX_AGE
    ) {
      return cached.version;
    }

    const resp = await fetch(
      'https://api.github.com/repos/boboidvtw/nomad-ai-workspace/releases/latest',
      {
        headers: { Accept: 'application/vnd.github+json' },
      },
    );
    if (resp.status === 404) {
      return null;
    }
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const candidate =
      typeof data.tag_name === 'string'
        ? data.tag_name
        : typeof data.name === 'string'
          ? data.name
          : null;

    if (candidate) {
      await browser.storage.local.set({
        [LATEST_VERSION_CACHE_KEY]: { version: candidate, fetchedAt: now },
      });
      return candidate;
    }
  } catch (error) {
    pmLogger.debug('Latest version check failed', { error });
  }
  return null;
}
