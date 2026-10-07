/**
 * useUniversalWidthControl.ts
 * Purpose: Universal chat width controller supporting Claude, ChatGPT, and Gemini.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { hasValidExtensionContext } from '@/core/utils/extensionContext';
import { readStoredChatWidth, writeStoredChatWidth } from '@/services/storage';

type WidthControlApi = {
  chatWidth: number;
  setChatWidth: (widthRem: number) => void;
};

const MIN_CHAT_WIDTH_REM = 38;
const MAX_CHAT_WIDTH_REM = 90;
const DEFAULT_CHAT_WIDTH_REM = 48;

const STYLE_ID = 'nomad-universal-width-override';
const STYLE_CHECK_INTERVAL_MS = 500;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const detectPlatform = (): 'claude' | 'gemini' | 'chatgpt' | 'grok' => {
  const host = window.location.hostname.toLowerCase();
  if (host.includes('claude.ai')) return 'claude';
  if (host.includes('chatgpt.com') || host.includes('openai.com')) return 'chatgpt';
  if (host.includes('gemini.google') || host.includes('aistudio.google')) return 'gemini';
  if (host.includes('grok.com') || host.includes('x.ai')) return 'grok';
  return 'claude';
};

const buildOverrideCss = (widthRem: number, platform: 'claude' | 'gemini' | 'chatgpt' | 'grok') => {
  if (platform === 'chatgpt') {
    return `
[class*='--thread-content-max-width'],
div[class*='react-scroll-to-bottom'] > div > div > div,
main article > div,
main div.text-base {
  --thread-content-max-width: ${widthRem}rem !important;
  max-width: ${widthRem}rem !important;
}
#thread-bottom-container {
  width: 100% !important;
  max-width: none !important;
}
`.trim();
  }

  if (platform === 'gemini') {
    return `
user-query,
user-query > *,
model-response,
model-response > *,
response-container,
response-container > *,
.conversation-container .md-content > *,
table-block .table-block,
input-container .input-area-container,
input-container input-area-v2 {
  max-width: ${widthRem}rem !important;
  width: min(100%, ${widthRem}rem) !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
`.trim();
  }

  if (platform === 'grok') {
    return `
div[class*='max-w-3xl'],
div[class*='max-w-4xl'],
main div[class*='mx-auto'][class*='max-w-'],
div[class*='message-container'] {
  max-width: ${widthRem}rem !important;
}
`.trim();
  }

  // Claude default
  return `
div.mx-auto.flex.size-full.max-w-3xl.flex-col,
div.flex-1.flex.flex-col.px-4.max-w-3xl.mx-auto.w-full.pt-1 {
  max-width: ${widthRem}rem !important;
}
`.trim();
};

const ensureStyleTag = (cssText: string) => {
  const head = document.head;
  if (!head) return;

  const existing = document.getElementById(STYLE_ID);
  if (existing && existing instanceof HTMLStyleElement) {
    if (existing.textContent !== cssText) existing.textContent = cssText;
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = cssText;
  head.appendChild(style);
};

export const useUniversalWidthControl = (
  platformOverride?: 'claude' | 'gemini' | 'chatgpt' | 'grok',
): WidthControlApi => {
  const platform = platformOverride ?? detectPlatform();
  const [chatWidth, setChatWidthState] = useState<number>(DEFAULT_CHAT_WIDTH_REM);
  const chatWidthRef = useRef(chatWidth);

  useEffect(() => {
    chatWidthRef.current = chatWidth;
  }, [chatWidth]);

  const refresh = useCallback(() => {
    const next = clamp(chatWidthRef.current, MIN_CHAT_WIDTH_REM, MAX_CHAT_WIDTH_REM);
    ensureStyleTag(buildOverrideCss(next, platform));
  }, [platform]);

  useEffect(() => {
    void (async () => {
      const stored = await readStoredChatWidth();
      const initial = clamp(
        stored ?? DEFAULT_CHAT_WIDTH_REM,
        MIN_CHAT_WIDTH_REM,
        MAX_CHAT_WIDTH_REM,
      );
      setChatWidthState(initial);
      chatWidthRef.current = initial;
      refresh();
    })();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!hasValidExtensionContext()) {
        window.clearInterval(timer);
        return;
      }
      const style = document.getElementById(STYLE_ID);
      if (!style) refresh();
    }, STYLE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const setChatWidth = useCallback(
    (widthRem: number) => {
      const next = clamp(widthRem, MIN_CHAT_WIDTH_REM, MAX_CHAT_WIDTH_REM);
      setChatWidthState(next);
      chatWidthRef.current = next;
      refresh();
      void writeStoredChatWidth(next);
    },
    [refresh],
  );

  return { chatWidth, setChatWidth };
};

export const CHAT_WIDTH_RANGE = {
  min: MIN_CHAT_WIDTH_REM,
  max: MAX_CHAT_WIDTH_REM,
  defaultValue: DEFAULT_CHAT_WIDTH_REM,
} as const;
