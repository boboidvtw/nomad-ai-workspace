import { describe, expect, it } from 'vitest';

import { extractChatGPTConversationIdFromHref, parseFoldersFromStorageValue } from '../storage';

describe('ChatGPT Storage Service', () => {
  describe('extractChatGPTConversationIdFromHref', () => {
    it('extracts ID from standard relative /c/ path', () => {
      expect(extractChatGPTConversationIdFromHref('/c/6a9f32f7-3a38-4e89-a289-56bfb0a887b2')).toBe(
        '6a9f32f7-3a38-4e89-a289-56bfb0a887b2',
      );
    });

    it('extracts ID from absolute chatgpt.com URL', () => {
      expect(extractChatGPTConversationIdFromHref('https://chatgpt.com/c/chat-12345')).toBe(
        'chat-12345',
      );
    });

    it('extracts ID from custom GPT path with /c/', () => {
      expect(
        extractChatGPTConversationIdFromHref('https://chatgpt.com/g/g-abcde/c/gpt-chat-999'),
      ).toBe('gpt-chat-999');
    });

    it('returns null for non-conversation URLs', () => {
      expect(extractChatGPTConversationIdFromHref('https://chatgpt.com/')).toBeNull();
      expect(extractChatGPTConversationIdFromHref('/g/g-abcde')).toBeNull();
      expect(extractChatGPTConversationIdFromHref('')).toBeNull();
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
          id: 'folder-1',
          name: '  Project Alpha  ',
          conversationIds: ['conv-1', 'conv-1', '/c/conv-2'],
          isExpanded: false,
        },
      ];

      const result = parseFoldersFromStorageValue(input);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('folder-1');
      expect(result[0].name).toBe('Project Alpha');
      expect(result[0].conversationIds).toEqual(['conv-1', 'conv-2']);
      expect(result[0].isExpanded).toBe(false);
    });

    it('handles object with folders property', () => {
      const input = {
        folders: [
          {
            id: 'folder-2',
            name: 'Research',
            conversationIds: ['conv-3'],
          },
        ],
      };

      const result = parseFoldersFromStorageValue(input);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Research');
      expect(result[0].isExpanded).toBe(true);
    });
  });
});
