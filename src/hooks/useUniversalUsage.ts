/**
 * useUniversalUsage.ts
 * Purpose: Platform-aware usage monitoring hook for Claude, Gemini, and ChatGPT.
 * Powers the concentric circular UsageRings and hover tooltip card.
 * Seamlessly integrates live chat submissions across ChatGPT, Gemini, and Claude.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { PlatformId } from '@/components/FloatBall/composerAnchor';
import { StorageKeys } from '@/core/types/common';
import { fetchUsageData, type UsageData } from '@/features/claude/services/usage';

export type { UsageData };

export const USAGE_REFRESH_INTERVAL_MS = 60_000;
export const CHATGPT_USAGE_KEY = 'nomad_chatgpt_usage';
export const GV_USAGE_OBSERVER_SRC = 'gv-usage-observer';
export const GV_USAGE_OBSERVER_CMD = 'gv-usage-observer-cmd';

export const clampPercentage = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

export const detectPlatform = (): PlatformId => {
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
  if (host.includes('claude.ai')) return 'claude';
  if (host.includes('chatgpt.com') || host.includes('openai.com')) return 'chatgpt';
  if (host.includes('gemini.google') || host.includes('aistudio.google')) return 'gemini';
  if (host.includes('grok.com') || host.includes('x.ai')) return 'grok';
  return 'claude';
};

/**
 * Parses Gemini cached UsageSnapshot or raw storage into UsageData
 */
export const parseGeminiUsage = (raw: unknown): UsageData | null => {
  if (!raw || typeof raw !== 'object') return null;
  const snapshot = raw as {
    daily?: { percent?: number | string; resetEpoch?: number; resetLabel?: string };
    weekly?: { percent?: number | string; resetEpoch?: number; resetLabel?: string };
  };

  const parseVal = (v: unknown): number => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
      const parsed = parseFloat(v.replace(/%/g, ''));
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const dailyPercent =
    snapshot.daily?.percent !== undefined ? clampPercentage(parseVal(snapshot.daily.percent)) : 10;
  const weeklyPercent =
    snapshot.weekly?.percent !== undefined ? clampPercentage(parseVal(snapshot.weekly.percent)) : 4;

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
 * Parses ChatGPT usage tracking from history timestamps or explicit numbers
 */
export const parseChatGPTUsage = (raw: unknown): UsageData => {
  const now = Date.now();
  let fiveHour = 10;
  let sevenDay = 4;

  if (raw && typeof raw === 'object') {
    const data = raw as { history?: number[]; fiveHour?: number; sevenDay?: number };
    if (Array.isArray(data.history) && data.history.length > 0) {
      const recent5h = data.history.filter(
        (t) => typeof t === 'number' && now - t < 5 * 3600 * 1000,
      ).length;
      const recent7d = data.history.filter(
        (t) => typeof t === 'number' && now - t < 7 * 24 * 3600 * 1000,
      ).length;
      // Baseline quota assumption: 40 messages per 5 hours, 200 messages per 7 days
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

export const useUniversalUsage = (platformOverride?: PlatformId) => {
  const platform = platformOverride ?? detectPlatform();
  const [usageData, setUsageData] = useState<UsageData | null>(null);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const lastSubmitTimeRef = useRef(0);
  const chatgptHistoryRef = useRef<number[]>([]);

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
          window.postMessage({ source: GV_USAGE_OBSERVER_CMD, action: 'replay' }, '*');
        } catch {}
      } else if (platform === 'chatgpt') {
        if (!chrome?.storage?.local) return;
        const res = await new Promise<Record<string, unknown>>((resolve) => {
          chrome.storage.local.get([CHATGPT_USAGE_KEY], (v) => resolve(v || {}));
        });
        const raw = res[CHATGPT_USAGE_KEY];
        if (
          raw &&
          typeof raw === 'object' &&
          Array.isArray((raw as { history?: number[] }).history)
        ) {
          chatgptHistoryRef.current = (raw as { history: number[] }).history;
        }
        const parsed = parseChatGPTUsage(raw);
        if (!mountedRef.current) return;
        setUsageData(parsed);
      } else if (platform === 'grok') {
        if (!mountedRef.current) return;
        setUsageData({
          fiveHour: 8,
          sevenDay: 3,
          fiveResetAt: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
          sevenResetAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        });
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

    // 1. Storage changes listener for Gemini & ChatGPT
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
        const raw = changes[CHATGPT_USAGE_KEY].newValue;
        if (
          raw &&
          typeof raw === 'object' &&
          Array.isArray((raw as { history?: number[] }).history)
        ) {
          chatgptHistoryRef.current = (raw as { history: number[] }).history;
        }
        const parsed = parseChatGPTUsage(raw);
        if (mountedRef.current) setUsageData(parsed);
      }
    };

    chrome?.storage?.onChanged?.addListener(handleStorageChange);

    // 2. Gemini generation observer bridge listener
    const handleWindowMessage = (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const data = ev.data as { source?: string; type?: string } | null;
      if (data?.source === GV_USAGE_OBSERVER_SRC) {
        if (data?.type === 'generation-complete' || data?.type === 'replay-result') {
          setTimeout(() => {
            if (mountedRef.current) void refreshUsage();
          }, 350);
        }
      }
    };
    window.addEventListener('message', handleWindowMessage);

    // 3. Universal user submission detector (ChatGPT, Gemini, Claude)
    const handleKeyOrClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Filter out IME composition Enter events (e.g. typing Chinese / Zhuyin)
      if (e instanceof KeyboardEvent) {
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key !== 'Enter' || e.shiftKey) return;
      }

      const now = Date.now();

      // ChatGPT submission handler
      if (platform === 'chatgpt') {
        const isSendBtn =
          target.closest('[data-testid="send-button"]') ||
          target.closest('[data-testid="fruitjuice-send-button"]') ||
          target.closest('button[data-testid*="send"]') ||
          target.closest('button[aria-label*="Send"]') ||
          target.closest('button[aria-label*="發送"]') ||
          target.closest('button[aria-label*="傳送"]') ||
          target.closest('button[aria-label*="Submit"]') ||
          target.closest('form:has(#prompt-textarea) button[type="submit"]') ||
          target.closest('#thread-bottom-container form button');

        const isEnterInTextarea =
          e instanceof KeyboardEvent &&
          Boolean(target.closest('#prompt-textarea, textarea, div[contenteditable="true"]'));

        if (isSendBtn || isEnterInTextarea) {
          if (now - lastSubmitTimeRef.current < 1200) return;
          lastSubmitTimeRef.current = now;

          // Optimistic local update for instantaneous ring feedback
          const nextHistory = [...chatgptHistoryRef.current, now].slice(-300);
          chatgptHistoryRef.current = nextHistory;
          const optimisticData = parseChatGPTUsage({ history: nextHistory });
          setUsageData(optimisticData);

          // Persist to local storage
          void chrome?.storage?.local?.set({ [CHATGPT_USAGE_KEY]: { history: nextHistory } });
        }
      }

      // Gemini submission handler
      if (platform === 'gemini') {
        const isSendBtn =
          target.closest('button[aria-label*="Send"]') ||
          target.closest('button[aria-label*="發送"]') ||
          target.closest('button[aria-label*="傳送"]') ||
          target.closest('button.send-button') ||
          target.closest('.send-button-container button');

        const isEnterInComposer =
          e instanceof KeyboardEvent &&
          Boolean(target.closest('rich-textarea, input-area-v2, div[contenteditable="true"]'));

        if (isSendBtn || isEnterInComposer) {
          if (now - lastSubmitTimeRef.current < 1200) return;
          lastSubmitTimeRef.current = now;

          // Schedule replay shortly after generation triggers
          setTimeout(() => {
            try {
              window.postMessage({ source: GV_USAGE_OBSERVER_CMD, action: 'replay' }, '*');
            } catch {}
          }, 1500);
        }
      }

      // Claude submission handler
      if (platform === 'claude') {
        const isSendBtn =
          target.closest('button[aria-label*="Send"]') ||
          target.closest('button[aria-label*="發送"]') ||
          target.closest('button[aria-label*="傳送"]') ||
          target.closest('button[data-testid*="send"]');

        const isEnterInProseMirror =
          e instanceof KeyboardEvent &&
          Boolean(target.closest('div[contenteditable="true"].ProseMirror, fieldset'));

        if (isSendBtn || isEnterInProseMirror) {
          if (now - lastSubmitTimeRef.current < 1200) return;
          lastSubmitTimeRef.current = now;

          // Schedule usage refetch after round-trip completes
          setTimeout(() => {
            if (mountedRef.current) void refreshUsage();
          }, 3000);
        }
      }
    };

    document.addEventListener('click', handleKeyOrClick, true);
    document.addEventListener('keydown', handleKeyOrClick, true);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
      chrome?.storage?.onChanged?.removeListener(handleStorageChange);
      window.removeEventListener('message', handleWindowMessage);
      document.removeEventListener('click', handleKeyOrClick, true);
      document.removeEventListener('keydown', handleKeyOrClick, true);
    };
  }, [platform, refreshUsage]);

  return { usageData, refreshUsage };
};
