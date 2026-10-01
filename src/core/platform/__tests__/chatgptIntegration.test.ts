import { describe, expect, it } from 'vitest';
import { SUPPORTED_PLATFORMS, detectCurrentPlatform } from '../registry';

describe('ChatGPT Platform Integration', () => {
  it('registers ChatGPT with active status and official brand color', () => {
    const config = SUPPORTED_PLATFORMS.chatgpt;
    expect(config).toBeDefined();
    expect(config.status).toBe('active');
    expect(config.brandColor).toBe('#10A37F');
    expect(config.domains).toContain('chatgpt.com');
    expect(config.domains).toContain('chat.openai.com');
  });

  it('detects chatgpt platform accurately from various URLs', () => {
    expect(detectCurrentPlatform('https://chatgpt.com/')).toBe('chatgpt');
    expect(detectCurrentPlatform('https://chatgpt.com/c/6a9f32f7-3a38-4e89-a289-56bfb0a887b2')).toBe('chatgpt');
    expect(detectCurrentPlatform('https://chat.openai.com/chat')).toBe('chatgpt');
    expect(detectCurrentPlatform('https://claude.ai/chat/123')).toBe('claude');
    expect(detectCurrentPlatform('https://gemini.google.com/app')).toBe('gemini');
  });
});
