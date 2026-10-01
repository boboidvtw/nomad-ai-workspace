/**
 * Nomad AI Workspace — Cross-Platform Folders Hook
 * Reads and normalizes folder trees across Gemini, Claude, ChatGPT, and future platforms.
 */

import { useEffect, useState } from 'react';
import { hasValidExtensionContext, isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import type { CrossPlatformFolder, PlatformId } from './types';

export const GEMINI_FOLDERS_KEY = 'folders';
export const GEMINI_CONTENTS_KEY = 'folderContents';
export const CLAUDE_FOLDERS_KEY = 'claude_nexus_folders';
export const CHATGPT_FOLDERS_KEY = 'chatgpt_folders';
export const CHATGPT_TITLES_KEY = 'chatgpt_conversation_titles';

export function useCrossPlatformFolders() {
  const [geminiFolders, setGeminiFolders] = useState<CrossPlatformFolder[]>([]);
  const [claudeFolders, setClaudeFolders] = useState<CrossPlatformFolder[]>([]);
  const [chatgptFolders, setChatGPTFolders] = useState<CrossPlatformFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local || !hasValidExtensionContext()) {
        setLoading(false);
        return;
      }

      const res = await new Promise<Record<string, any>>((resolve, reject) => {
        try {
          if (!hasValidExtensionContext()) {
            resolve({});
            return;
          }
          chrome.storage.local.get(
            [GEMINI_FOLDERS_KEY, GEMINI_CONTENTS_KEY, CLAUDE_FOLDERS_KEY, CHATGPT_FOLDERS_KEY, CHATGPT_TITLES_KEY],
            (items) => {
              const lastError = chrome.runtime?.lastError;
              if (lastError) {
                if (isExtensionContextInvalidatedError(lastError)) {
                  resolve({});
                  return;
                }
                reject(new Error(lastError.message));
                return;
              }
              resolve(items || {});
            },
          );
        } catch (err) {
          if (isExtensionContextInvalidatedError(err)) {
            resolve({});
          } else {
            reject(err);
          }
        }
      });

      // 1. Parse Gemini Folders
      const rawGeminiFolders: Array<{ id: string; name: string; isExpanded?: boolean }> = res[GEMINI_FOLDERS_KEY] || [];
      const rawGeminiContents: Record<string, Array<{ conversationId: string; title: string; url: string }>> = res[GEMINI_CONTENTS_KEY] || {};

      const parsedGemini: CrossPlatformFolder[] = rawGeminiFolders.map((f) => {
        const chats = rawGeminiContents[f.id] || [];
        return {
          id: f.id,
          name: f.name,
          platformId: 'gemini',
          isExpanded: f.isExpanded,
          conversations: chats.map((c) => ({
            id: c.conversationId,
            title: c.title || '無標題對話',
            url: c.url || `https://gemini.google.com/app/${c.conversationId}`,
            platformId: 'gemini',
            folderId: f.id,
          })),
        };
      });
      setGeminiFolders(parsedGemini);

      // 2. Parse Claude Folders
      const rawClaudeFolders: Array<{ id: string; name: string; conversationIds: string[]; isExpanded?: boolean }> = res[CLAUDE_FOLDERS_KEY] || [];
      const parsedClaude: CrossPlatformFolder[] = rawClaudeFolders.map((f) => {
        const chatIds = f.conversationIds || [];
        return {
          id: f.id,
          name: f.name,
          platformId: 'claude',
          isExpanded: f.isExpanded,
          conversations: chatIds.map((id) => ({
            id,
            title: `Claude 對話 (${id.slice(0, 8)})`,
            url: `https://claude.ai/chat/${id}`,
            platformId: 'claude',
            folderId: f.id,
          })),
        };
      });
      setClaudeFolders(parsedClaude);

      // 3. Parse ChatGPT Folders
      const rawChatGPTFolders: Array<{ id: string; name: string; conversationIds: string[]; isExpanded?: boolean }> = res[CHATGPT_FOLDERS_KEY] || [];
      const chatgptTitleCache: Record<string, string> = res[CHATGPT_TITLES_KEY] || {};
      const parsedChatGPT: CrossPlatformFolder[] = rawChatGPTFolders.map((f) => {
        const chatIds = f.conversationIds || [];
        return {
          id: f.id,
          name: f.name,
          platformId: 'chatgpt',
          isExpanded: f.isExpanded,
          conversations: chatIds.map((id) => ({
            id,
            title: chatgptTitleCache[id] || `ChatGPT 對話 (${id.slice(0, 8)})`,
            url: `https://chatgpt.com/c/${id}`,
            platformId: 'chatgpt',
            folderId: f.id,
          })),
        };
      });
      setChatGPTFolders(parsedChatGPT);
    } catch (e) {
      if (!isExtensionContextInvalidatedError(e)) {
        console.error('[Nomad Workspace] Failed to load cross-platform folders:', e);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hasValidExtensionContext()) return;
    void reload();

    const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (!hasValidExtensionContext()) return;
      if (
        areaName === 'local' &&
        (changes[GEMINI_FOLDERS_KEY] ||
          changes[GEMINI_CONTENTS_KEY] ||
          changes[CLAUDE_FOLDERS_KEY] ||
          changes[CHATGPT_FOLDERS_KEY] ||
          changes[CHATGPT_TITLES_KEY])
      ) {
        void reload();
      }
    };

    try {
      chrome?.storage?.onChanged?.addListener(handleStorageChange);
    } catch {
      // Ignore if context invalidated
    }
    return () => {
      try {
        chrome?.storage?.onChanged?.removeListener(handleStorageChange);
      } catch {
        // Ignore if context invalidated
      }
    };
  }, []);

  return {
    geminiFolders,
    claudeFolders,
    chatgptFolders,
    loading,
    reload,
  };
}
