/**
 * Nomad AI Workspace — Pluggable Platform Registry
 * SSOT for all supported and planned AI platforms.
 */

import type { AIPlatformConfig, PlatformId } from './types';
export type { AIPlatformConfig, PlatformId };

export const SUPPORTED_PLATFORMS: Record<PlatformId, AIPlatformConfig> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    shortName: 'Gemini',
    brandColor: '#4E88F5',
    badgeBg: 'bg-blue-500/15',
    badgeText: 'text-blue-400',
    domains: ['gemini.google.com', 'aistudio.google.com', 'aistudio.google.cn', 'business.gemini.google'],
    driveFolder: 'Gemini',
    status: 'active',
    homeUrl: 'https://gemini.google.com/',
    description: 'Google Gemini and Google AI Studio conversational workspace',
  },
  claude: {
    id: 'claude',
    name: 'Anthropic Claude',
    shortName: 'Claude',
    brandColor: '#D97757',
    badgeBg: 'bg-amber-600/15',
    badgeText: 'text-amber-500',
    domains: ['claude.ai'],
    driveFolder: 'Claude',
    status: 'active',
    homeUrl: 'https://claude.ai/',
    description: 'Anthropic Claude.ai projects, artifacts, and conversations',
  },
  chatgpt: {
    id: 'chatgpt',
    name: 'OpenAI ChatGPT',
    shortName: 'ChatGPT',
    brandColor: '#10A37F',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-400',
    domains: ['chatgpt.com', 'chat.openai.com'],
    driveFolder: 'ChatGPT',
    status: 'active',
    homeUrl: 'https://chatgpt.com/',
    description: 'OpenAI ChatGPT web interface conversations',
  },
  grok: {
    id: 'grok',
    name: 'xAI Grok',
    shortName: 'Grok',
    brandColor: '#1D9BF0',
    badgeBg: 'bg-sky-500/15',
    badgeText: 'text-sky-400',
    domains: ['grok.com', 'x.com/i/grok'],
    driveFolder: 'Grok',
    status: 'planned',
    homeUrl: 'https://grok.com/',
    description: 'xAI Grok standalone and X web platform',
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    shortName: 'DeepSeek',
    brandColor: '#4D6BFE',
    badgeBg: 'bg-indigo-500/15',
    badgeText: 'text-indigo-400',
    domains: ['chat.deepseek.com'],
    driveFolder: 'DeepSeek',
    status: 'planned',
    homeUrl: 'https://chat.deepseek.com/',
    description: 'DeepSeek chat reasoning and code assistant',
  },
};

/**
 * Detects the active platform ID based on the current window location or provided URL.
 */
export function detectCurrentPlatform(url: string = typeof window !== 'undefined' ? window.location.href : ''): PlatformId | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    for (const [id, config] of Object.entries(SUPPORTED_PLATFORMS)) {
      if (config.domains.some((d: string) => host === d || host.endsWith('.' + d))) {
        return id as PlatformId;
      }
    }
  } catch {
    // Invalid URL fallback
  }
  return null;
}

export function getPlatformConfig(id: PlatformId): AIPlatformConfig {
  return SUPPORTED_PLATFORMS[id];
}

export function getAllPlatforms(): AIPlatformConfig[] {
  return Object.values(SUPPORTED_PLATFORMS);
}
