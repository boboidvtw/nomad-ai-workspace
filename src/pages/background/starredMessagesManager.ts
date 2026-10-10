import { StorageKeys } from '@/core/types/common';
import { isStarredMessagesData } from '@/core/utils/syncDataGuards';
import type { StarredMessage, StarredMessagesData } from '@/pages/content/timeline/starredTypes';

/**
 * Centralized starred messages management to prevent race conditions.
 * All read-modify-write operations are serialized through this background script.
 */
export class StarredMessagesManager {
  private operationQueue: Promise<unknown> = Promise.resolve();

  /**
   * Serialize all operations to prevent race conditions
   */
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const promise = this.operationQueue.then(operation, operation);
    this.operationQueue = promise.catch(() => {}); // Prevent error propagation
    return promise;
  }

  private async getFromStorage(): Promise<StarredMessagesData> {
    try {
      const result = await chrome.storage.local.get([StorageKeys.TIMELINE_STARRED_MESSAGES]);
      const starred = result[StorageKeys.TIMELINE_STARRED_MESSAGES];
      return isStarredMessagesData(starred) ? starred : { messages: {} };
    } catch (error) {
      console.error('[Background] Failed to get starred messages:', error);
      return { messages: {} };
    }
  }

  private async saveToStorage(data: StarredMessagesData): Promise<void> {
    await chrome.storage.local.set({ [StorageKeys.TIMELINE_STARRED_MESSAGES]: data });
  }

  async addStarredMessage(message: StarredMessage): Promise<boolean> {
    return this.serialize(async () => {
      const data = await this.getFromStorage();

      if (!data.messages[message.conversationId]) {
        data.messages[message.conversationId] = [];
      }

      // Check if message already exists
      const exists = data.messages[message.conversationId].some((m) => m.turnId === message.turnId);

      if (!exists) {
        // Truncate content to save storage space
        // Popup is ~360px wide with line-clamp-2, showing ~50-60 chars max
        const MAX_CONTENT_LENGTH = 60;
        const truncatedMessage: StarredMessage = {
          ...message,
          content:
            message.content.length > MAX_CONTENT_LENGTH
              ? message.content.slice(0, MAX_CONTENT_LENGTH) + '...'
              : message.content,
        };
        data.messages[message.conversationId].push(truncatedMessage);
        await this.saveToStorage(data);
        return true;
      }
      return false;
    });
  }

  async removeStarredMessage(conversationId: string, turnId: string): Promise<boolean> {
    return this.serialize(async () => {
      const data = await this.getFromStorage();

      if (data.messages[conversationId]) {
        const initialLength = data.messages[conversationId].length;
        data.messages[conversationId] = data.messages[conversationId].filter(
          (m) => m.turnId !== turnId,
        );

        if (data.messages[conversationId].length < initialLength) {
          // Remove conversation key if no messages left
          if (data.messages[conversationId].length === 0) {
            delete data.messages[conversationId];
          }

          await this.saveToStorage(data);
          return true;
        }
      }
      return false;
    });
  }

  async getAllStarredMessages(): Promise<StarredMessagesData> {
    return this.getFromStorage();
  }

  async getStarredMessagesForConversation(conversationId: string): Promise<StarredMessage[]> {
    const data = await this.getFromStorage();
    return data.messages[conversationId] || [];
  }

  async isMessageStarred(conversationId: string, turnId: string): Promise<boolean> {
    const messages = await this.getStarredMessagesForConversation(conversationId);
    return messages.some((m) => m.turnId === turnId);
  }

  async reconcileConversationIds(
    targetConversationId: string,
    sourceConversationIds: string[],
    conversationUrl?: string,
  ): Promise<StarredMessage[]> {
    return this.serialize(async () => {
      const data = await this.getFromStorage();
      const uniqueConversationIds = Array.from(
        new Set([targetConversationId, ...sourceConversationIds]),
      ).filter(Boolean);

      const mergedMessages = new Map<string, StarredMessage>();

      for (const conversationId of uniqueConversationIds) {
        const messages = data.messages[conversationId] || [];
        for (const message of messages) {
          const normalizedMessage: StarredMessage = {
            ...message,
            conversationId: targetConversationId,
            conversationUrl: conversationUrl || message.conversationUrl,
          };
          const existing = mergedMessages.get(message.turnId);
          if (!existing || normalizedMessage.starredAt >= existing.starredAt) {
            mergedMessages.set(message.turnId, normalizedMessage);
          }
        }
      }

      if (mergedMessages.size > 0) {
        data.messages[targetConversationId] = Array.from(mergedMessages.values());
      } else {
        delete data.messages[targetConversationId];
      }

      for (const conversationId of uniqueConversationIds) {
        if (conversationId !== targetConversationId) {
          delete data.messages[conversationId];
        }
      }

      await this.saveToStorage(data);
      return data.messages[targetConversationId] || [];
    });
  }
}
