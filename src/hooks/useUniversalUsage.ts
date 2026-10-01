/**
 * useUniversalUsage.ts
 * Purpose: Platform-aware usage monitoring hook for Claude, Gemini, and ChatGPT.
 * Powers the concentric circular UsageRings and hover tooltip card.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { StorageKeys } from '@/core/types/common';
import { fetchUsageData, type UsageData } from '@/features/claude/services/usage';

export type { UsageData };

const USAGE_REFRESH_INTERVAL_MS = 60_000;
const CHATGPT_USAGE_KEY = 'nomad_chatgpt_usage';

const clampPercentage = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

const detectPlatform = (): 'claude' | 'gemini' | 'chatgpt' => {
  const host = window.location.hostname.toLowerCase();
  if (host.includes('claude.ai')) return 'claude';
  if (host.includes('chatgpt.com') || host.includes('openai.com')) return 'chatgpt';
  if (host.includes('gemini.google') || host.includes('aistudio.google')) return 'gemini';
  return 'claude';
};

/**
 * Parses Gemini's cached UsageSnapshot from storage into UsageData
 */
const parseGeminiUsage = (raw: unknown): UsageData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const snapshot = raw as {
    daily?: { percent?: number; resetEpoch?: number; resetLabel?: string };
    weekly?: { percent?: number; resetEpoch?: number; resetLabel?: string };
  };

  const dailyPercent =
    typeof snapshot.daily?.percent === 'number' ? clampPercentage(snapshot.daily.percent) : 10;
  const weeklyPercent =
    typeof snapshot.weekly?.percent === 'number' ? clampPercentage(snapshot.weekly.percent) : 4;

  const now = Date.now();
  const fiveResetAt = snapshot.daily?.resetEpoch
    ? new Date(snapshot.daily.resetEpoch * 1000).toISOString()
    : new Date(now + 4.5 * 3600 * 1000).toISOString();

  const sevenResetAt = snapshot.weekly?.resetEpoch
    ? new Date(snapshot.weekly.resetEpoch * 1000).toISOString()
    : new Date(now + 7 * 24 * 3600 * 1000).toISOString();

  return {
    fiveHour: dailyPercent,
    sevenDay: weeklyPercent,
    fiveResetAt,
    sevenResetAt,
  };
};

/**
 * Parses ChatGPT usage tracking from storage
 */
const parseChatGPTUsage = (raw: unknown): UsageData => {
  const now = Date.now();
  let fiveHour = 10;
  let sevenDay = 4;

  if (raw && typeof raw === 'object') {
    const data = raw as { history?: number[]; fiveHour?: number; sevenDay?: number };
    if (Array.isArray(data.history) && data.history.length > 0) {
      const recent5h = data.history.filter((t) => now - t < 5 * 3600 * 1000).length;
      const recent7d = data.history.filter((t) => now - t < 7 * 24 * 3600 * 1000).length;
      fiveHour = clampPercentage(Math.max(5, Math.round((recent5h / 40) * 100)));
      sevenDay = clampPercentage(Math.max(2, Math.round((recent7d / 200) * 100)));
    } else if (typeof data.fiveHour === 'number') {
      fiveHour = clampPercentage(data.fiveHour);
      sevenDay = typeof data.sevenDay === 'number' ? clampPercentage(data.sevenDay) : 4;
    }
  }

  return {
    fiveHour,
    sevenDay,
    fiveResetAt: new Date(now + 4.5 * 3600 * 1000).toISOString(),
    sevenResetAt: new Date(now + 7 * 24 * 3600 * 1000).toISOString(),
  };
};

export const useUniversalUsage = (platformOverride?: 'claude' | 'gemini' | 'chatgpt') => {
  const platform = platformOverride ?? detectPlatform();
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  const refreshUsage = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      if (platform === 'claude') {
        const next = await fetchUsageData();
        if (!mountedRef.current) return;
        if (next) {
          setUsageData(next);
        } else {
          // If offline or initial, fallback to healthy baseline
          setUsageData({
            fiveHour: 10,
            sevenDay: 4,
            fiveResetAt: new Date(Date.now() + 4.5 * 3600 * 1000).toISOString(),
            sevenResetAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          });
        }
      } else if (platform === 'gemini') {
        if (!chrome?.storage?.local) return;
        const res = await new Promise<Record<string, unknown>>((resolve) => {
          chrome.storage.local.get([StorageKeys.GV_USAGE_CACHE], (v) => resolve(v || {}));
        });
        const parsed = parseGeminiUsage(res[StorageKeys.GV_USAGE_CACHE]);
        if (!mountedRef.current) return;
        setUsageData(
          parsed ?? {
            fiveHour: 10,
            sevenDay: 4,
            fiveResetAt: new Date(Date.now() + 4.5 * 3600 * 1000).toISOString(),
            sevenResetAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
          },
        );

        // Attempt to trigger Gemini usage observer background replay
        try {
          window.postMessage({ source: 'gv-usage-observer-cmd', action: 'replay' }, '*');
        } catch {}
      } else if (platform === 'chatgpt') {
        if (!chrome?.storage?.local) return;
        const res = await new Promise<Record<string, unknown>>((resolve) => {
          chrome.storage.local.get([CHATGPT_USAGE_KEY], (v) => resolve(v || {}));
        });
        const parsed = parseChatGPTUsage(res[CHATGPT_USAGE_KEY]);
        if (!mountedRef.current) return;
        setUsageData(parsed);
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [platform]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshUsage();

    const timer = window.setInterval(() => {
      void refreshUsage();
    }, USAGE_REFRESH_INTERVAL_MS);

    // Listen to storage changes for Gemini & ChatGPT
    const handleStorageChange: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (
      changes,
      area,
    ) => {
      if (area !== 'local') return;
      if (platform === 'gemini' && changes[StorageKeys.GV_USAGE_CACHE]) {
        const parsed = parseGeminiUsage(changes[StorageKeys.GV_USAGE_CACHE].newValue);
        if (parsed && mountedRef.current) setUsageData(parsed);
      }
      if (platform === 'chatgpt' && changes[CHATGPT_USAGE_KEY]) {
        const parsed = parseChatGPTUsage(changes[CHATGPT_USAGE_KEY].newValue);
        if (mountedRef.current) setUsageData(parsed);
      }
    };

    chrome?.storage?.onChanged?.addListener(handleStorageChange);

    // On ChatGPT, track user submissions to update prompt count
    const handleKeyOrClick = (e: Event) => {
      if (platform !== 'chatgpt') return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const isSendButton =
        target.closest('[data-testid="send-button"]') ||
        target.closest('button[aria-label="Send prompt"]') ||
        target.closest('button[data-testid*="send"]');

      const isEnter = e instanceof KeyboardEvent && e.key === 'Enter' && !e.shiftKey;

      if (
        isSendButton ||
        (isEnter && target.matches('#prompt-textarea, textarea, div[contenteditable="true"]'))
      ) {
        setTimeout(async () => {
          try {
            const res = await new Promise<Record<string, unknown>>((resolve) => {
              chrome.storage.local.get([CHATGPT_USAGE_KEY], (v) => resolve(v || {}));
            });
            const prev = (res[CHATGPT_USAGE_KEY] as { history?: number[] }) || {};
            const history = Array.isArray(prev.history) ? [...prev.history] : [];
            history.push(Date.now());
            // Keep last 300 timestamps
            const trimmed = history.slice(-300);
            await chrome.storage.local.set({ [CHATGPT_USAGE_KEY]: { history: trimmed } });
          } catch {}
        }, 200);
      }
    };

    if (platform === 'chatgpt') {
      document.addEventListener('click', handleKeyOrClick, true);
      document.addEventListener('keydown', handleKeyOrClick, true);
    }

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      chrome?.storage?.onChanged?.removeListener(handleStorageChange);
      if (platform === 'chatgpt') {
        document.removeEventListener('click', handleKeyOrClick, true);
        document.removeEventListener('keydown', handleKeyOrClick, true);
      }
    };
  }, [platform, refreshUsage]);

  return { usageData, refreshUsage };
};
