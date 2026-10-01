/**
 * Nomad AI Workspace — ChatGPT Types
 */

import type { Folder } from '@/types/folder';

export interface ChatGPTConversation {
  id: string;
  title: string;
  url: string;
}

export type { Folder as ChatGPTFolder };
