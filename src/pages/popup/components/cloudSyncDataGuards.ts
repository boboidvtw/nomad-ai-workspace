import type { FolderData } from '@/core/types/folder';
import type { PromptItem } from '@/core/types/sync';
import type { TimelineHierarchyData } from '@/pages/content/timeline/hierarchyTypes';
import type { StarredMessagesData } from '@/pages/content/timeline/starredTypes';

// Shape checks for data read back from storage or a Drive download before the
// popup merges it. The background service worker keeps its own, stricter copies.

export function isFolderData(value: unknown): value is FolderData {
  if (typeof value !== 'object' || value === null) return false;
  const data = value as { folders?: unknown; folderContents?: unknown };
  return (
    Array.isArray(data.folders) &&
    typeof data.folderContents === 'object' &&
    data.folderContents !== null
  );
}

export function parseStoredFolderData(value: unknown): FolderData | null {
  if (isFolderData(value)) return value;
  if (typeof value !== 'string') return null;

  try {
    const parsed: unknown = JSON.parse(value);
    return isFolderData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isPromptItemArray(value: unknown): value is PromptItem[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (typeof item !== 'object' || item === null) return false;
      const prompt = item as Record<string, unknown>;
      return (
        typeof prompt.id === 'string' &&
        typeof prompt.text === 'string' &&
        Array.isArray(prompt.tags) &&
        prompt.tags.every((tag) => typeof tag === 'string') &&
        typeof prompt.createdAt === 'number'
      );
    })
  );
}

export function isStarredMessagesData(value: unknown): value is StarredMessagesData {
  if (typeof value !== 'object' || value === null) return false;
  if (!('messages' in value)) return false;
  const messages = (value as { messages: unknown }).messages;
  return typeof messages === 'object' && messages !== null;
}

export function isTimelineHierarchyData(value: unknown): value is TimelineHierarchyData {
  if (typeof value !== 'object' || value === null) return false;
  if (!('conversations' in value)) return false;
  const conversations = (value as { conversations: unknown }).conversations;
  return typeof conversations === 'object' && conversations !== null;
}
