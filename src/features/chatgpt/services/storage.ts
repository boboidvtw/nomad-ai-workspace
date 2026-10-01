/**
 * Nomad AI Workspace — ChatGPT Storage Service
 * Handles reading and writing ChatGPT folders and title cache in chrome.storage.local.
 */

import type { Folder } from '@/types/folder';
import { i18n } from '@/services/i18n';

export const CHATGPT_STORAGE_KEY = 'chatgpt_folders';
export const CHATGPT_CONVERSATION_TITLE_CACHE_KEY = 'chatgpt_conversation_titles';

type StorageOpResult<T> = { ok: true; value: T | undefined } | { ok: false; error: string };
export type ConversationTitleCache = Record<string, string>;

const sanitizeFolderName = (name: string) => name.trim().slice(0, 60);

export const extractChatGPTConversationIdFromHref = (href: string): string | null => {
  if (!href) return null;
  const match = href.match(/\/c\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
};

const normalizeConversationId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const fromHref = extractChatGPTConversationIdFromHref(trimmed);
  if (fromHref) return fromHref;
  if (trimmed.length >= 6 && !trimmed.includes('/')) return trimmed;
  return null;
};

export const parseFoldersFromStorageValue = (value: unknown): Folder[] => {
  if (!value || typeof value !== 'object') return [];

  const foldersRaw = Array.isArray(value) ? value : (value as { folders?: unknown }).folders;
  if (!Array.isArray(foldersRaw)) return [];

  const folders: Folder[] = foldersRaw
    .map((f) => {
      if (!f || typeof f !== 'object') return null;
      const folder = f as Partial<Folder>;
      if (!folder.id || typeof folder.id !== 'string') return null;
      if (!folder.name || typeof folder.name !== 'string') return null;

      const conversationIds = Array.isArray(folder.conversationIds)
        ? folder.conversationIds
            .map((id) => normalizeConversationId(id))
            .filter((id): id is string => Boolean(id))
        : [];

      const dedupedConversationIds = Array.from(new Set(conversationIds));

      return {
        id: folder.id,
        name: sanitizeFolderName(folder.name) || i18n.t('storage.unnamedFolder') || '未命名資料夾',
        conversationIds: dedupedConversationIds,
        isExpanded: typeof folder.isExpanded === 'boolean' ? folder.isExpanded : true,
      } satisfies Folder;
    })
    .filter((x): x is Folder => Boolean(x));

  return folders;
};

const storageLocalGet = <T>(key: string): Promise<StorageOpResult<T>> => {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) return resolve({ ok: false, error: 'Storage unavailable' });
    try {
      chrome.storage.local.get([key], (result) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          return resolve({ ok: false, error: err.message ?? 'Unknown storage error' });
        }
        resolve({ ok: true, value: result?.[key] as T | undefined });
      });
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
};

const storageLocalSet = (key: string, value: unknown): Promise<StorageOpResult<void>> => {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) return resolve({ ok: false, error: 'Storage unavailable' });
    try {
      chrome.storage.local.set({ [key]: value }, () => {
        const err = chrome.runtime?.lastError;
        if (err) {
          return resolve({ ok: false, error: err.message ?? 'Unknown storage error' });
        }
        resolve({ ok: true, value: undefined });
      });
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
};

export const getChatGPTFolders = async (): Promise<Folder[]> => {
  if (!chrome?.storage?.local) return [];
  const current = await storageLocalGet<unknown>(CHATGPT_STORAGE_KEY);
  if (current.ok && current.value !== undefined) return parseFoldersFromStorageValue(current.value);
  return [];
};

export const saveChatGPTFolders = async (folders: Folder[]): Promise<void> => {
  if (!chrome?.storage?.local) return;
  await storageLocalSet(CHATGPT_STORAGE_KEY, folders);
};

const parseConversationTitleCache = (value: unknown): ConversationTitleCache => {
  if (!value || typeof value !== 'object') return {};

  const entries = Object.entries(value as Record<string, unknown>)
    .map(([id, title]) => {
      const normalizedId = normalizeConversationId(id);
      const normalizedTitle = typeof title === 'string' ? title.trim() : null;
      if (!normalizedId || !normalizedTitle) return null;
      return [normalizedId, normalizedTitle] as const;
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry));

  return Object.fromEntries(entries);
};

export const getChatGPTTitleCache = async (): Promise<ConversationTitleCache> => {
  if (!chrome?.storage?.local) return {};
  const current = await storageLocalGet<unknown>(CHATGPT_CONVERSATION_TITLE_CACHE_KEY);
  if (current.ok && current.value !== undefined) return parseConversationTitleCache(current.value);
  return {};
};

export const saveChatGPTTitleCache = async (cache: ConversationTitleCache): Promise<void> => {
  if (!chrome?.storage?.local) return;
  const sanitized = parseConversationTitleCache(cache);
  await storageLocalSet(CHATGPT_CONVERSATION_TITLE_CACHE_KEY, sanitized);
};
