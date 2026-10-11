/**
 * Tests for the shared sync data shape guards used by the popup and the background worker
 */
import { describe, expect, it } from 'vitest';

import {
  isFolderData,
  isPromptItemArray,
  isStarredMessagesData,
  isTimelineHierarchyData,
  parseStoredFolderData,
} from '../syncDataGuards';

const validFolderData = { folders: [], folderContents: { inbox: [] } };

const validPrompt = { id: 'p1', text: 'hello', tags: ['a'], createdAt: 1 };

describe('isFolderData', () => {
  it('accepts folders with array contents', () => {
    expect(isFolderData(validFolderData)).toBe(true);
  });

  it('rejects folderContents entries that are not arrays', () => {
    expect(isFolderData({ folders: [], folderContents: { inbox: 'x' } })).toBe(false);
  });

  it('rejects missing folders or folderContents', () => {
    expect(isFolderData({ folderContents: {} })).toBe(false);
    expect(isFolderData({ folders: [] })).toBe(false);
    expect(isFolderData(null)).toBe(false);
  });
});

describe('parseStoredFolderData', () => {
  it('returns objects and JSON strings that pass the guard', () => {
    expect(parseStoredFolderData(validFolderData)).toEqual(validFolderData);
    expect(parseStoredFolderData(JSON.stringify(validFolderData))).toEqual(validFolderData);
  });

  it('returns null for invalid JSON and invalid shapes', () => {
    expect(parseStoredFolderData('{oops')).toBeNull();
    expect(parseStoredFolderData(JSON.stringify({ folders: [], folderContents: { a: 1 } }))).toBe(
      null,
    );
    expect(parseStoredFolderData(42)).toBeNull();
  });
});

describe('isPromptItemArray', () => {
  it('accepts valid prompts, with or without optional fields', () => {
    expect(isPromptItemArray([])).toBe(true);
    expect(isPromptItemArray([validPrompt, { ...validPrompt, updatedAt: 2, name: 'n' }])).toBe(
      true,
    );
  });

  it('rejects non-finite timestamps', () => {
    expect(isPromptItemArray([{ ...validPrompt, createdAt: Number.NaN }])).toBe(false);
    expect(isPromptItemArray([{ ...validPrompt, updatedAt: Infinity }])).toBe(false);
  });

  it('accepts a finite pinnedAt and rejects any other pinnedAt value', () => {
    expect(isPromptItemArray([{ ...validPrompt, pinnedAt: 5 }])).toBe(true);
    expect(isPromptItemArray([{ ...validPrompt, pinnedAt: Number.NaN }])).toBe(false);
    expect(isPromptItemArray([{ ...validPrompt, pinnedAt: '5' }])).toBe(false);
    expect(isPromptItemArray([{ ...validPrompt, pinnedAt: null }])).toBe(false);
  });

  it('rejects wrong optional field types and non-string tags', () => {
    expect(isPromptItemArray([{ ...validPrompt, name: 1 }])).toBe(false);
    expect(isPromptItemArray([{ ...validPrompt, tags: [1] }])).toBe(false);
    expect(isPromptItemArray([null])).toBe(false);
  });
});

describe('isStarredMessagesData', () => {
  it('accepts messages keyed by conversation with array values', () => {
    expect(isStarredMessagesData({ messages: {} })).toBe(true);
    expect(isStarredMessagesData({ messages: { c1: [] } })).toBe(true);
  });

  it('rejects message entries that are not arrays', () => {
    expect(isStarredMessagesData({ messages: { c1: {} } })).toBe(false);
    expect(isStarredMessagesData({ messages: null })).toBe(false);
    expect(isStarredMessagesData({})).toBe(false);
  });
});

describe('isTimelineHierarchyData', () => {
  it('requires a conversations object', () => {
    expect(isTimelineHierarchyData({ conversations: {} })).toBe(true);
    expect(isTimelineHierarchyData({ conversations: null })).toBe(false);
    expect(isTimelineHierarchyData('x')).toBe(false);
  });
});
