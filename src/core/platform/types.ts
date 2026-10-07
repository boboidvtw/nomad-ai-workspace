/**
 * Nomad AI Workspace — Platform Definitions & Types
 * Defines the pluggable registry for supported AI platforms.
 */

export type PlatformId = 'gemini' | 'claude' | 'chatgpt' | 'grok' | 'deepseek';

export type PlatformStatus = 'active' | 'ready' | 'planned';

export interface AIPlatformConfig {
  id: PlatformId;
  name: string; // e.g. "Google Gemini"
  shortName: string; // e.g. "Gemini"
  brandColor: string; // Hex or CSS color
  badgeBg: string; // Tailwind badge class or hex
  badgeText: string; // Text color
  domains: string[]; // Hostname matchers
  driveFolder: string; // Google Drive subfolder name under "Nomad Workspace/"
  status: PlatformStatus;
  homeUrl: string; // Default URL to launch platform
  description: string;
}

export interface CrossPlatformConversation {
  id: string;
  title: string;
  url: string;
  platformId: PlatformId;
  folderId?: string | null;
  updatedAt?: number;
}

export interface CrossPlatformFolder {
  id: string;
  name: string;
  platformId: PlatformId;
  isExpanded?: boolean;
  conversations: CrossPlatformConversation[];
}
