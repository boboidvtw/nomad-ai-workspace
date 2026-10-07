import React, { act, useEffect } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import {
  clampPercentage,
  detectPlatform,
  parseGeminiUsage,
  parseChatGPTUsage,
  useUniversalUsage,
} from '../useUniversalUsage';

const storageMock: Record<string, any> = {};

function HookHarness({
  platform,
  onUpdate,
}: {
  platform: 'claude' | 'gemini' | 'chatgpt';
  onUpdate: (api: ReturnType<typeof useUniversalUsage>) => void;
}) {
  const api = useUniversalUsage(platform);
  useEffect(() => {
    onUpdate(api);
  }, [api, onUpdate]);
  return null;
}

describe('useUniversalUsage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn((keys: string[], cb: (res: any) => void) => {
            const res: Record<string, any> = {};
            for (const k of keys) res[k] = storageMock[k];
            cb(res);
          }),
          set: vi.fn((data: Record<string, any>, cb?: () => void) => {
            Object.assign(storageMock, data);
            cb?.();
          }),
        },
        onChanged: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    };

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    for (const key of Object.keys(storageMock)) delete storageMock[key];
    vi.clearAllMocks();
  });

  describe('utility functions', () => {
    it('clampPercentage clamps value within 0 and 100', () => {
      expect(clampPercentage(-10)).toBe(0);
      expect(clampPercentage(55.4)).toBe(55);
      expect(clampPercentage(120)).toBe(100);
    });

    it('detectPlatform returns a platform string', () => {
      expect(detectPlatform()).toBeDefined();
    });

    it('parseGeminiUsage handles numeric and string percentages', () => {
      const parsed = parseGeminiUsage({
        daily: { percent: '42%', resetEpoch: 1700000000 },
        weekly: { percent: 18, resetEpoch: 1700000500 },
      });

      expect(parsed).not.toBeNull();
      expect(parsed?.fiveHour).toBe(42);
      expect(parsed?.sevenDay).toBe(18);
      expect(parsed?.fiveResetAt).toBe(new Date(1700000000 * 1000).toISOString());
    });

    it('parseGeminiUsage handles null or empty input gracefully', () => {
      expect(parseGeminiUsage(null)).toBeNull();
      expect(parseGeminiUsage(undefined)).toBeNull();
      expect(parseGeminiUsage('invalid')).toBeNull();
    });

    it('parseChatGPTUsage calculates percentages from history timestamps', () => {
      const now = Date.now();
      const history = [now - 1000, now - 2000, now - 3000, now - 10 * 3600 * 1000];

      const res = parseChatGPTUsage({ history });
      expect(res.fiveHour).toBeGreaterThan(0);
      expect(res.sevenDay).toBeGreaterThan(0);
    });

    it('parseChatGPTUsage falls back to default baseline when history is empty', () => {
      const res = parseChatGPTUsage({});
      expect(res.fiveHour).toBe(10);
      expect(res.sevenDay).toBe(4);
    });
  });

  describe('hook lifecycle and event synchronization', () => {
    it('reads Gemini usage from chrome.storage.local', async () => {
      storageMock[StorageKeys.GV_USAGE_CACHE] = {
        daily: { percent: 30 },
        weekly: { percent: 15 },
      };

      let latestApi: any = null;
      await act(async () => {
        root.render(
          <HookHarness
            platform="gemini"
            onUpdate={(api) => {
              latestApi = api;
            }}
          />,
        );
      });

      await act(async () => {
        await latestApi?.refreshUsage();
      });

      expect(latestApi?.usageData).not.toBeNull();
      expect(latestApi?.usageData?.fiveHour).toBe(30);
      expect(latestApi?.usageData?.sevenDay).toBe(15);
    });

    it('optimistically updates ChatGPT usage on send button click', async () => {
      await act(async () => {
        root.render(<HookHarness platform="chatgpt" onUpdate={() => {}} />);
      });

      // Simulate clicking ChatGPT send button
      const sendBtn = document.createElement('button');
      sendBtn.setAttribute('data-testid', 'send-button');
      document.body.appendChild(sendBtn);

      await act(async () => {
        sendBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(chrome.storage.local.set).toHaveBeenCalled();
      sendBtn.remove();
    });

    it('handles Enter key on chat textarea without shift', async () => {
      await act(async () => {
        root.render(<HookHarness platform="chatgpt" onUpdate={() => {}} />);
      });

      const textarea = document.createElement('textarea');
      textarea.id = 'prompt-textarea';
      document.body.appendChild(textarea);

      await act(async () => {
        textarea.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            shiftKey: false,
            bubbles: true,
          }),
        );
      });

      expect(chrome.storage.local.set).toHaveBeenCalled();
      textarea.remove();
    });

    it('ignores Enter key when IME is composing (Chinese input method)', async () => {
      await act(async () => {
        root.render(<HookHarness platform="chatgpt" onUpdate={() => {}} />);
      });

      const textarea = document.createElement('textarea');
      textarea.id = 'prompt-textarea';
      document.body.appendChild(textarea);

      const setCallCountBefore = (chrome.storage.local.set as any).mock.calls.length;

      await act(async () => {
        textarea.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            isComposing: true,
            bubbles: true,
          }),
        );
      });

      expect((chrome.storage.local.set as any).mock.calls.length).toBe(setCallCountBefore);
      textarea.remove();
    });
  });
});
