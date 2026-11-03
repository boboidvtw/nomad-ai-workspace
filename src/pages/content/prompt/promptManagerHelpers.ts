/**
 * Prompt Manager helpers that hold no panel state: storage keys and access, theme detection, i18n,
 * small DOM builders, tag lists and panel placement. Moved out of the entry point unchanged.
 */
import browser from 'webextension-polyfill';

import { logger } from '@/core/services/LoggerService';
import { promptStorageService } from '@/core/services/StorageService';
import { type StorageKey, StorageKeys } from '@/core/types/common';
import type { PromptItem } from '@/core/types/sync';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { getCurrentLanguage, getTranslationSync, setCachedLanguage } from '@/utils/i18n';
import type { AppLanguage } from '@/utils/language';
import type { TranslationKey } from '@/utils/translations';

export type PanelPosition = { top: number; left: number };
export type TriggerPosition = { bottom: number; right: number };
export type PMPanelView = 'prompts' | 'starred';

export function isPMPanelView(value: unknown): value is PMPanelView {
  return value === 'prompts' || value === 'starred';
}

export const STORAGE_KEYS = {
  items: StorageKeys.PROMPT_ITEMS,
  locked: StorageKeys.PROMPT_PANEL_LOCKED,
  position: StorageKeys.PROMPT_PANEL_POSITION,
  triggerPos: StorageKeys.PROMPT_TRIGGER_POSITION,
  selectedTags: StorageKeys.PROMPT_SELECTED_TAGS,
  language: StorageKeys.LANGUAGE, // reuse global language key
  theme: StorageKeys.PROMPT_THEME,
} as const;

export type PMTheme = 'light' | 'dark';
export type PMViewMode = 'compact' | 'comfortable';

export function detectPageTheme(): PMTheme {
  if (
    document.querySelector('.theme-host.dark-theme') ||
    document.body.classList.contains('dark-theme') ||
    document.documentElement.classList.contains('dark') ||
    document.body.getAttribute('data-theme') === 'dark'
  ) {
    return 'dark';
  }
  if (
    document.querySelector('.theme-host.light-theme') ||
    document.body.classList.contains('light-theme') ||
    document.documentElement.classList.contains('light') ||
    document.body.getAttribute('data-theme') === 'light'
  ) {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getRuntimeUrl(path: string): string {
  // Try the standard Web Extensions API first (mainly for Firefox)
  try {
    return browser.runtime.getURL(path);
  } catch {
    const win = window as Window & { chrome?: { runtime?: { getURL?: (path: string) => string } } };
    return win.chrome?.runtime?.getURL?.(path) || path;
  }
}

// Use centralized i18n system
export function createI18n() {
  return {
    t: (key: TranslationKey): string => getTranslationSync(key),
    set: async (lang: AppLanguage) => {
      try {
        // Check if extension context is still valid
        if (!browser.runtime?.id) {
          // Extension context invalidated, skip
          return;
        }
        setCachedLanguage(lang);
        await browser.storage.sync.set({ language: lang });
        return;
      } catch (e) {
        try {
          await browser.storage.local.set({ language: lang });
          return;
        } catch (localError) {
          // Silently ignore extension context errors
          if (
            isExtensionContextInvalidatedError(e) ||
            isExtensionContextInvalidatedError(localError)
          ) {
            return;
          }
          console.warn('[PromptManager] Failed to set language:', e, localError);
        }
      }
    },
    get: async (): Promise<AppLanguage> => await getCurrentLanguage(),
  };
}

export function uid(): string {
  // FNV-1a-ish hash over timestamp + rand
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Storage adapter - uses chrome.storage.local for cross-domain data sharing
 * Falls back to localStorage if chrome.storage is unavailable
 */
export const pmLogger = logger.createChild('PromptManager');

export async function readStorage<T>(key: StorageKey, fallback: T): Promise<T> {
  const result = await promptStorageService.get<T>(key);
  if (result.success) {
    return result.data;
  }
  pmLogger.debug(`Key not found: ${key}, using fallback`);
  return fallback;
}

export async function writeStorage<T>(key: StorageKey, value: T): Promise<void> {
  const result = await promptStorageService.set(key, value);
  if (!result.success) {
    pmLogger.error(`Failed to write key: ${key}`, {
      error: result.error?.message || 'Unknown error',
      errorDetails: result.error,
    });
  }
}

export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

export function elFromHTML(html: string): HTMLElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild as HTMLElement;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.trim().toLowerCase();
    if (!t) continue;
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function collectAllTags(items: PromptItem[]): string[] {
  const set = new Set<string>();
  for (const it of items) for (const t of it.tags || []) set.add(String(t).toLowerCase());
  return Array.from(set).sort();
}

export function copyText(text: string): Promise<void> {
  try {
    return navigator.clipboard.writeText(text);
  } catch {
    return new Promise<void>((resolve) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {}
      ta.remove();
      resolve();
    });
  }
}

export function computeAnchoredPosition(
  trigger: HTMLElement,
  panel: HTMLElement,
): { top: number; left: number } {
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const pad = 8;
  const panelW = Math.min(380, Math.max(300, panel.getBoundingClientRect().width || 320));
  const tentativeLeft = Math.min(vw - panelW - pad, Math.max(pad, rect.left + rect.width - panelW));
  const top = Math.max(pad, rect.top - (panel.getBoundingClientRect().height || 360) - 10);
  return { top, left: Math.round(tentativeLeft) };
}
