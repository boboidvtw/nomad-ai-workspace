/**
 * composerAnchor.ts
 * Cross-platform detection and anchoring math for the central chat input box.
 * Supports Claude, Gemini, and ChatGPT across multiple display resolutions and zoom levels.
 */

import { findChatInput } from "@/pages/content/chatInput";

export type PlatformId = "claude" | "gemini" | "chatgpt" | "grok";

export type Size = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type AnchorOptions = {
  gap?: number;
  allowAdaptiveSide?: boolean;
};

const isValidBox = (el: Element | null): el is HTMLElement => {
  if (!el || !(el instanceof HTMLElement)) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 40 && rect.height > 15;
};

export function findComposerElement(platform?: PlatformId): HTMLElement | null {
  const trySelector = (sel: string): HTMLElement | null => {
    try {
      const candidates = document.querySelectorAll<HTMLElement>(sel);
      for (const el of Array.from(candidates)) {
        if (isValidBox(el)) return el;
      }
    } catch {
      // In case selector fails in older environment
    }
    return null;
  };

  // 1. Platform-specific preferred selectors
  if (platform === "chatgpt") {
    const el =
      trySelector("#thread-bottom-container form") ||
      trySelector("form:has(#prompt-textarea)") ||
      trySelector('form[data-testid="composer-form"]') ||
      trySelector('div[class*="--thread-content-max-width"] form') ||
      trySelector('form:has([data-testid*="send-button"])') ||
      trySelector('div:has(> #prompt-textarea)') ||
      trySelector("#prompt-textarea");
    if (el) return el;
  } else if (platform === "gemini") {
    const el =
      trySelector("input-area-v2") ||
      trySelector("input-container .input-area-container") ||
      trySelector("input-container") ||
      trySelector(".input-area-container") ||
      trySelector(".input-and-toolbox-container") ||
      trySelector("rich-textarea") ||
      trySelector(".input-area");
    if (el) return el;
  } else if (platform === "claude") {
    const el =
      trySelector('fieldset:has([contenteditable="true"])') ||
      trySelector('fieldset:has([data-testid="chat-input"])') ||
      trySelector("div:has(> div.ProseMirror)") ||
      trySelector('div[data-testid="chat-input-container"]') ||
      trySelector('[data-testid="chat-input"]') ||
      trySelector('div[contenteditable="true"].ProseMirror');
    if (el) return el;
  } else if (platform === "grok") {
    const el =
      trySelector('form:has(textarea)') ||
      trySelector('div:has(> textarea[placeholder*="Grok"])') ||
      trySelector('div[class*="composer"]') ||
      trySelector('div:has(> textarea)') ||
      trySelector('textarea[placeholder*="Grok"]') ||
      trySelector('textarea[placeholder*="Ask"]') ||
      trySelector('textarea');
    if (el) return el;
  }

  // 2. Cross-platform universal selectors
  const universal =
    trySelector("#thread-bottom-container form") ||
    trySelector("form:has(#prompt-textarea)") ||
    trySelector('fieldset:has([contenteditable="true"])') ||
    trySelector("input-area-v2") ||
    trySelector("input-container") ||
    trySelector(".input-area-container") ||
    trySelector('form:has(textarea, [contenteditable="true"])');
  if (universal) return universal;

  // 3. Fallback: locate via chat input and walk up to its container
  try {
    const input = findChatInput({ requireVisible: true });
    if (input) {
      const container = input.closest<HTMLElement>(
        "form, fieldset, input-area-v2, input-container, .input-area-container, .input-area, ms-prompt-input-wrapper, div[class*='composer'], div[class*='input-container']",
      );
      if (isValidBox(container)) {
        return container;
      }
      if (isValidBox(input)) {
        return input;
      }
    }
  } catch {
    // Fallback safe
  }

  return null;
}

/**
 * Computes coordinates immediately to the right of the central composer.
 * Clamps within viewport with comfortable boundary safety.
 * Supports adaptive side placement when right edge is cramped to prevent covering send button.
 */
export function computeComposerAnchorPosition(
  composer: HTMLElement,
  ballSize: Size,
  gapOrOptions: number | AnchorOptions = 14,
): Point {
  const gap = typeof gapOrOptions === "number" ? gapOrOptions : (gapOrOptions?.gap ?? 14);
  const allowAdaptiveSide =
    typeof gapOrOptions === "object" ? Boolean(gapOrOptions.allowAdaptiveSide) : false;

  const rect = composer.getBoundingClientRect();
  const vw =
    typeof window !== "undefined" && window.visualViewport
      ? window.visualViewport.width
      : (typeof window !== "undefined" ? window.innerWidth : 1440);
  const vh =
    typeof window !== "undefined" && window.visualViewport
      ? window.visualViewport.height
      : (typeof window !== "undefined" ? window.innerHeight : 900);

  const maxX = Math.max(8, vw - ballSize.width - 8);
  let x = rect.right + gap;
  let y: number;

  // Check if right side space is too cramped to fit without overlapping send button
  if (allowAdaptiveSide && x > maxX) {
    const leftSpace = rect.left - gap - ballSize.width;
    if (leftSpace >= 8) {
      // Adaptive mode 1: Flip to left side of composer if left side has ample space
      x = leftSpace;
    } else {
      // Adaptive mode 2: Float above the composer right edge
      x = Math.max(8, Math.min(maxX, rect.right - ballSize.width));
      y = Math.max(8, rect.top - ballSize.height - gap);
      const maxY = Math.max(8, vh - ballSize.height - 8);
      return { x: Math.round(x), y: Math.round(Math.min(maxY, y)) };
    }
  } else {
    if (x > maxX) {
      x = maxX;
    } else {
      x = Math.max(8, x);
    }
  }

  // Vertical:
  // For compact composer (e.g. <= 80px), vertically center with composer.
  // For taller composer (e.g. multi-line typing), align with bottom line of composer.
  if (rect.height <= ballSize.height + 24) {
    y = rect.top + (rect.height - ballSize.height) / 2;
  } else {
    y = rect.bottom - ballSize.height - 4;
  }

  // Viewport vertical bounds clamping
  const maxY = Math.max(8, vh - ballSize.height - 8);
  y = Math.min(maxY, Math.max(8, y));

  return { x: Math.round(x), y: Math.round(y) };
}
