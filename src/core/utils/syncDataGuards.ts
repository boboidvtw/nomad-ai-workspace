import type { FolderData } from '@/core/types/folder';
import type { PromptItem } from '@/core/types/sync';
import type { TimelineHierarchyData } from '@/pages/content/timeline/hierarchyTypes';
import type { StarredMessagesData } from '@/pages/content/timeline/starredTypes';

// Shape checks for sync data read back from storage or a Drive download.
// The popup and the background worker share these so they accept the same data.

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

export function isFolderData(value: unknown): value is FolderData {
  if (!isObject(value)) return false;
  const { folders, folderContents } = value;
  return (
    Array.isArray(folders) &&
    isObject(folderContents) &&
    Object.values(folderContents).every((contents) => Array.isArray(contents))
  );
}

export function parseStoredFolderData(value: unknown): FolderData | null {
  if (typeof value !== 'string') return isFolderData(value) ? value : null;

  try {
    const parsed: unknown = JSON.parse(value);
    return isFolderData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isPromptItem(value: unknown): value is PromptItem {
  if (!isObject(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.text === 'string' &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string') &&
    typeof value.createdAt === 'number' &&
    Number.isFinite(value.createdAt) &&
    isOptionalFiniteNumber(value.updatedAt) &&
    (value.name === undefined || typeof value.name === 'string')
  );
}

export function isPromptItemArray(value: unknown): value is PromptItem[] {
  return Array.isArray(value) && value.every(isPromptItem);
}

export function isStarredMessagesData(value: unknown): value is StarredMessagesData {
  if (!isObject(value) || !isObject(value.messages)) return false;
  return Object.values(value.messages).every((messages) => Array.isArray(messages));
}

export function isTimelineHierarchyData(value: unknown): value is TimelineHierarchyData {
  return isObject(value) && isObject(value.conversations);
}
