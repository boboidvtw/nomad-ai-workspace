import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { findComposerElement } from '@/components/FloatBall/composerAnchor';
import { findChatInput, insertTextIntoChatInput } from '@/pages/content/chatInput';
import { SUPPORTED_PLATFORMS, detectCurrentPlatform } from '@/core/platform/registry';

vi.mock('@/pages/content/prompt', () => ({
  startPromptManager: vi.fn(),
}));

vi.mock('@/pages/content/prompt/slashPromptFeature', () => ({
  startSlashPromptFeature: vi.fn(),
}));

vi.mock('@/services/i18n', () => ({
  initI18n: vi.fn().mockResolvedValue(undefined),
  i18n: { changeLanguage: vi.fn() },
  LANGUAGE_CHANGE_MESSAGE_TYPE: 'LANGUAGE_CHANGED',
}));

describe('xAI Grok Adapter & Super Orb Integration', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('registers xAI Grok with active status and official brand color in platform registry', () => {
    const grok = SUPPORTED_PLATFORMS.grok;
    expect(grok).toBeDefined();
    expect(grok.status).toBe('active');
    expect(grok.brandColor).toBe('#1D9BF0');
    expect(grok.domains).toContain('grok.com');
    expect(detectCurrentPlatform('https://grok.com/')).toBe('grok');
    expect(detectCurrentPlatform('https://grok.com/chat/123')).toBe('grok');
  });

  it('detects Grok chat input and composer form correctly', () => {
    const form = document.createElement('form');
    const textarea = document.createElement('textarea');
    textarea.placeholder = 'Ask Grok anything...';
    form.appendChild(textarea);
    container.appendChild(form);

    // Mock bounding rects
    form.getBoundingClientRect = () => ({
      width: 600,
      height: 56,
      top: 600,
      bottom: 656,
      left: 100,
      right: 700,
      x: 100,
      y: 600,
      toJSON: () => {},
    });
    textarea.getBoundingClientRect = () => ({
      width: 580,
      height: 48,
      top: 604,
      bottom: 652,
      left: 110,
      right: 690,
      x: 110,
      y: 604,
      toJSON: () => {},
    });

    const composer = findComposerElement('grok');
    expect(composer).toBe(form);

    const input = findChatInput({ requireVisible: false });
    expect(input).toBe(textarea);

    const inserted = insertTextIntoChatInput('Tell me about SpaceX Starship', textarea);
    expect(inserted).toBe(true);
    expect(textarea.value).toBe('Tell me about SpaceX Starship');
  });

  it('initializes Grok page attributes and mounts Super Orb container', async () => {
    const { mountGrokWorkspace } = await import('../index');
    await mountGrokWorkspace();

    expect(document.body.classList.contains('nomad-grok-page')).toBe(true);
    expect(document.body.getAttribute('data-nomad-orb-active')).toBe('true');
    expect(document.getElementById('nomad-grok-root')).toBeTruthy();
  });
});
