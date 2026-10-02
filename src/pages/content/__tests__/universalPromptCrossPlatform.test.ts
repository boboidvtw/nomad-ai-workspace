import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { findChatInput, insertTextIntoChatInput } from '../chatInput';
import { fillPromptTemplate, isPromptTemplate, promptTemplateVariables } from '@/features/prompt/model/promptTemplate';

describe('Universal Prompts Cross-Platform Navigation & Input Adaptation', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    document.body.innerHTML = '';
  });

  it('detects and inserts text into ChatGPT contenteditable prompt textarea (#prompt-textarea)', () => {
    const chatgptComposer = document.createElement('div');
    chatgptComposer.id = 'prompt-textarea';
    chatgptComposer.setAttribute('contenteditable', 'true');
    // Mock getBoundingClientRect
    chatgptComposer.getBoundingClientRect = () => ({
      width: 600,
      height: 48,
      top: 500,
      bottom: 548,
      left: 100,
      right: 700,
      x: 100,
      y: 500,
      toJSON: () => {},
    });
    container.appendChild(chatgptComposer);

    const input = findChatInput({ requireVisible: false });
    expect(input).toBe(chatgptComposer);

    const promptText = 'Explain Quantum Computing in simple terms';
    const success = insertTextIntoChatInput(promptText, chatgptComposer);
    expect(success).toBe(true);
    expect(chatgptComposer.textContent).toContain('Explain Quantum Computing');
  });

  it('detects and inserts text into Claude ProseMirror editable area (div.ProseMirror)', () => {
    const claudeFieldset = document.createElement('fieldset');
    const claudeInput = document.createElement('div');
    claudeInput.className = 'ProseMirror';
    claudeInput.setAttribute('contenteditable', 'true');
    claudeInput.setAttribute('data-testid', 'chat-input');
    claudeInput.getBoundingClientRect = () => ({
      width: 650,
      height: 52,
      top: 480,
      bottom: 532,
      left: 120,
      right: 770,
      x: 120,
      y: 480,
      toJSON: () => {},
    });
    claudeFieldset.appendChild(claudeInput);
    container.appendChild(claudeFieldset);

    const input = findChatInput({ requireVisible: false });
    expect(input).toBe(claudeInput);

    const promptText = 'Review this code for security vulnerabilities';
    const success = insertTextIntoChatInput(promptText, claudeInput);
    expect(success).toBe(true);
    expect(claudeInput.textContent).toContain('Review this code for security');
  });

  it('correctly parses and fills dynamic variable templates ({{variable}}) across platforms', () => {
    const template = 'Translate this {{language}} text: {{content}} to {{target_lang}}';
    expect(isPromptTemplate(template)).toBe(true);
    expect(promptTemplateVariables(template)).toEqual(['language', 'content', 'target_lang']);

    const filled = fillPromptTemplate(template, {
      language: 'English',
      content: 'Hello World',
      target_lang: 'Traditional Chinese',
    });
    expect(filled).toBe('Translate this English text: Hello World to Traditional Chinese');
  });
});
