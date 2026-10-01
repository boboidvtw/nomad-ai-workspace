/**
 * storage.ts
 * Purpose: Typed wrappers around chrome.storage.local with runtime-safe parsing and context invalidation protection.
 * Last updated: 2026-10-01
 */

import type { Prompt } from "@src/types/prompt";
import { hasValidExtensionContext } from "@/core/utils/extensionContext";

export const CHAT_WIDTH_STORAGE_KEY = "chatWidth";
export const FLOAT_BALL_POSITION_STORAGE_KEY = "floatBallPosition";
export const FLOAT_BALL_SIZE_STORAGE_KEY = "floatBallSize";
export const PROMPT_LIBRARY_STORAGE_KEY = "promptLibrary";
export const GV_PROMPT_ITEMS_KEY = "gvPromptItems";

const parseChatWidth = (value: unknown): number | undefined => {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) return undefined;
  return value;
};

export type FloatBallPosition = { x: number; y: number; userCustom?: boolean };

const parseFloatBallPosition = (value: unknown): FloatBallPosition | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Partial<FloatBallPosition>;
  if (typeof v.x !== "number" || Number.isNaN(v.x) || !Number.isFinite(v.x)) return undefined;
  if (typeof v.y !== "number" || Number.isNaN(v.y) || !Number.isFinite(v.y)) return undefined;
  return { x: v.x, y: v.y, userCustom: v.userCustom ? Boolean(v.userCustom) : false };
};

const parseFloatBallSize = (value: unknown): number | undefined => {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) return undefined;
  return value;
};

const parsePrompt = (value: unknown): Prompt | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Partial<Prompt>;
  if (typeof v.id !== "string" || !v.id) return undefined;
  if (typeof v.title !== "string") return undefined;
  if (typeof v.content !== "string") return undefined;
  if (v.tags !== undefined) {
    if (!Array.isArray(v.tags)) return undefined;
    if (!v.tags.every((t) => typeof t === "string")) return undefined;
  }
  if (typeof v.createdAt !== "number" || Number.isNaN(v.createdAt) || !Number.isFinite(v.createdAt)) return undefined;
  return { id: v.id, title: v.title, content: v.content, tags: v.tags, createdAt: v.createdAt };
};

const parsePromptLibrary = (value: unknown): Prompt[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const parsed = value.map(parsePrompt).filter((v): v is Prompt => Boolean(v));
  if (parsed.length !== value.length) return undefined;
  return parsed;
};

/**
 * Reads chat width override from local storage.
 */
export const readStoredChatWidth = async (): Promise<number | undefined> => {
  try {
    if (typeof chrome === "undefined" || !chrome?.storage?.local || !hasValidExtensionContext()) return undefined;
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      try {
        if (!hasValidExtensionContext()) return resolve({});
        chrome.storage.local.get([CHAT_WIDTH_STORAGE_KEY], (value) => {
          if (chrome.runtime?.lastError) return resolve({});
          resolve(value || {});
        });
      } catch {
        resolve({});
      }
    });
    return parseChatWidth(result[CHAT_WIDTH_STORAGE_KEY]);
  } catch {
    return undefined;
  }
};

/**
 * Persists chat width override to local storage.
 */
export const writeStoredChatWidth = async (chatWidth: number): Promise<void> => {
  try {
    if (typeof chrome === "undefined" || !chrome?.storage?.local || !hasValidExtensionContext()) return;
    await new Promise<void>((resolve) => {
      try {
        if (!hasValidExtensionContext()) return resolve();
        chrome.storage.local.set({ [CHAT_WIDTH_STORAGE_KEY]: chatWidth }, () => {
          if (chrome.runtime?.lastError) return resolve();
          resolve();
        });
      } catch {
        resolve();
      }
    });
  } catch {
    return;
  }
};

/**
 * Reads the stored floating ball position.
 */
export const readStoredFloatBallPosition = async (): Promise<FloatBallPosition | undefined> => {
  try {
    if (typeof chrome === "undefined" || !chrome?.storage?.local || !hasValidExtensionContext()) return undefined;
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      try {
        if (!hasValidExtensionContext()) return resolve({});
        chrome.storage.local.get([FLOAT_BALL_POSITION_STORAGE_KEY], (value) => {
          if (chrome.runtime?.lastError) return resolve({});
          resolve(value || {});
        });
      } catch {
        resolve({});
      }
    });
    return parseFloatBallPosition(result[FLOAT_BALL_POSITION_STORAGE_KEY]);
  } catch {
    return undefined;
  }
};

/**
 * Persists the floating ball position to local storage.
 */
export const writeStoredFloatBallPosition = async (position: FloatBallPosition): Promise<void> => {
  try {
    if (typeof chrome === "undefined" || !chrome?.storage?.local || !hasValidExtensionContext()) return;
    await new Promise<void>((resolve) => {
      try {
        if (!hasValidExtensionContext()) return resolve();
        chrome.storage.local.set({ [FLOAT_BALL_POSITION_STORAGE_KEY]: position }, () => {
          if (chrome.runtime?.lastError) return resolve();
          resolve();
        });
      } catch {
        resolve();
      }
    });
  } catch {
    return;
  }
};

/**
 * Reads the stored floating ball size scale.
 */
export const readStoredFloatBallSize = async (): Promise<number | undefined> => {
  try {
    if (typeof chrome === "undefined" || !chrome?.storage?.local || !hasValidExtensionContext()) return undefined;
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      try {
        if (!hasValidExtensionContext()) return resolve({});
        chrome.storage.local.get([FLOAT_BALL_SIZE_STORAGE_KEY], (value) => {
          if (chrome.runtime?.lastError) return resolve({});
          resolve(value || {});
        });
      } catch {
        resolve({});
      }
    });
    return parseFloatBallSize(result[FLOAT_BALL_SIZE_STORAGE_KEY]);
  } catch {
    return undefined;
  }
};

/**
 * Persists the floating ball size scale.
 */
export const writeStoredFloatBallSize = async (size: number): Promise<void> => {
  try {
    if (typeof chrome === "undefined" || !chrome?.storage?.local || !hasValidExtensionContext()) return;
    await new Promise<void>((resolve) => {
      try {
        if (!hasValidExtensionContext()) return resolve();
        chrome.storage.local.set({ [FLOAT_BALL_SIZE_STORAGE_KEY]: size }, () => {
          if (chrome.runtime?.lastError) return resolve();
          resolve();
        });
      } catch {
        resolve();
      }
    });
  } catch {
    return;
  }
};

/**
 * Reads the persisted prompt library list, unifying Claude promptLibrary and Gemini gvPromptItems.
 */
export const readStoredPromptLibrary = async (): Promise<Prompt[] | undefined> => {
  try {
    if (typeof chrome === "undefined" || !chrome?.storage?.local || !hasValidExtensionContext()) return undefined;
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      try {
        if (!hasValidExtensionContext()) return resolve({});
        chrome.storage.local.get([PROMPT_LIBRARY_STORAGE_KEY, GV_PROMPT_ITEMS_KEY], (value) => {
          if (chrome.runtime?.lastError) return resolve({});
          resolve(value || {});
        });
      } catch {
        resolve({});
      }
    });

    const gvItems = result[GV_PROMPT_ITEMS_KEY];
    const claudeItems = parsePromptLibrary(result[PROMPT_LIBRARY_STORAGE_KEY]) || [];

    if (Array.isArray(gvItems) && gvItems.length > 0) {
      const gvConverted: Prompt[] = gvItems.map((item: unknown) => {
        const it = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return {
          id: typeof it.id === 'string' ? it.id : `prompt-${Date.now()}`,
          title: typeof it.name === 'string' ? it.name : (typeof it.text === 'string' ? it.text.slice(0, 30) : 'Prompt'),
          content: typeof it.text === 'string' ? it.text : '',
          tags: Array.isArray(it.tags) ? it.tags.filter((t): t is string => typeof t === 'string') : [],
          createdAt: typeof it.createdAt === 'number' ? it.createdAt : Date.now(),
        };
      })


      const map = new Map<string, Prompt>();
      for (const p of claudeItems) map.set(p.content, p);
      for (const p of gvConverted) {
        if (!map.has(p.content)) {
          map.set(p.content, p);
        }
      }
      return Array.from(map.values());
    }

    return claudeItems.length > 0 ? claudeItems : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Persists the prompt library list to both promptLibrary and gvPromptItems.
 */
export const writeStoredPromptLibrary = async (prompts: Prompt[]): Promise<void> => {
  try {
    if (typeof chrome === "undefined" || !chrome?.storage?.local || !hasValidExtensionContext()) return;
    const gvFormat = prompts.map((p) => ({
      id: p.id,
      name: p.title,
      text: p.content,
      tags: p.tags || [],
      createdAt: p.createdAt,
    }));
    await new Promise<void>((resolve) => {
      try {
        if (!hasValidExtensionContext()) return resolve();
        chrome.storage.local.set(
          {
            [PROMPT_LIBRARY_STORAGE_KEY]: prompts,
            [GV_PROMPT_ITEMS_KEY]: gvFormat,
          },
          () => {
            if (chrome.runtime?.lastError) return resolve();
            resolve();
          }
        );
      } catch {
        resolve();
      }
    });
  } catch {
    return;
  }
};
