import { describe, expect, it } from 'vitest';
import {
  extractGrokConversationIdFromHref,
  parseFoldersFromStorageValue,
} from '../storage';

describe('Grok Storage Service', () => {
  describe('extractGrokConversationIdFromHref', () => {
    it('extracts ID from standard relative /chat/ path', () => {
      expect(extractGrokConversationIdFromHref('/chat/7b8c9d0e-1a2b-3c4d-5e6f-7a8b9c0d1e2f')).toBe(
        '7b8c9d0e-1a2b-3c4d-5e6f-7a8b9c0d1e2f',
      );
    });

    it('extracts ID from absolute grok.com/chat/ URL', () => {
      expect(extractGrokConversationIdFromHref('https://grok.com/chat/grok-chat-12345')).toBe('grok-chat-12345');
    });

    it('extracts ID from relative and absolute /c/ URL', () => {
      expect(extractGrokConversationIdFromHref('/c/conv-9988')).toBe('conv-9988');
      expect(extractGrokConversationIdFromHref('https://grok.com/c/conv-9988')).toBe('conv-9988');
    });

    it('returns null for non-conversation URLs', () => {
      expect(extractGrokConversationIdFromHref('https://grok.com/')).toBeNull();
      expect(extractGrokConversationIdFromHref('/share/abc')).toBeNull();
      expect(extractGrokConversationIdFromHref('')).toBeNull();
    });
  });

  describe('parseFoldersFromStorageValue', () => {
    it('returns empty array on invalid or non-object values', () => {
      expect(parseFoldersFromStorageValue(null)).toEqual([]);
      expect(parseFoldersFromStorageValue(undefined)).toEqual([]);
      expect(parseFoldersFromStorageValue('invalid')).toEqual([]);
    });

    it('parses valid folder arrays and dedupes conversation IDs', () => {
      const input = [
        {
          id: 'folder-grok-1',
          name: '  SpaceX & Starship Research  ',
          conversationIds: ['conv-1', 'conv-1', '/chat/conv-2'],
          isExpanded: false,
        },
      ];

      const result = parseFoldersFromStorageValue(input);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('folder-grok-1');
      expect(result[0].name).toBe('SpaceX & Starship Research');
      expect(result[0].conversationIds).toEqual(['conv-1', 'conv-2']);
      expect(result[0].isExpanded).toBe(false);
    });

    it('handles object with folders property', () => {
      const input = {
        folders: [
          {
            id: 'folder-grok-2',
            name: 'AI Math & Reasoning',
            conversationIds: ['math-chat-1'],
          },
        ],
      };

      const result = parseFoldersFromStorageValue(input);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('AI Math & Reasoning');
      expect(result[0].isExpanded).toBe(true);
    });
  });
});
