import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { computeComposerAnchorPosition, findComposerElement } from '../composerAnchor';

describe('composerAnchor', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1440 });
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 900 });
  });

  afterEach(() => {
    container.remove();
  });

  describe('findComposerElement', () => {
    it('detects ChatGPT composer form', () => {
      container.innerHTML = `
        <div id="thread-bottom-container">
          <form style="width: 768px; height: 64px;">
            <div id="prompt-textarea" contenteditable="true" style="width: 700px; height: 40px;"></div>
          </form>
        </div>
      `;
      const form = container.querySelector('form')!;
      form.getBoundingClientRect = () => ({
        width: 768,
        height: 64,
        top: 800,
        bottom: 864,
        left: 336,
        right: 1104,
        x: 336,
        y: 800,
        toJSON: () => {},
      });

      const found = findComposerElement('chatgpt');
      expect(found).toBe(form);
    });

    it('detects Gemini input-area-v2 container', () => {
      container.innerHTML = `
        <input-area-v2 style="width: 800px; height: 72px;">
          <rich-textarea style="width: 750px; height: 50px;">
            <div contenteditable="true" style="width: 750px; height: 50px;"></div>
          </rich-textarea>
        </input-area-v2>
      `;
      const inputArea = container.querySelector('input-area-v2')!;
      inputArea.getBoundingClientRect = () => ({
        width: 800,
        height: 72,
        top: 780,
        bottom: 852,
        left: 320,
        right: 1120,
        x: 320,
        y: 780,
        toJSON: () => {},
      });

      const found = findComposerElement('gemini');
      expect(found).toBe(inputArea);
    });

    it('detects Claude fieldset composer', () => {
      container.innerHTML = `
        <fieldset style="width: 780px; height: 68px;">
          <div data-testid="chat-input" contenteditable="true" style="width: 720px; height: 44px;"></div>
        </fieldset>
      `;
      const fieldset = container.querySelector('fieldset')!;
      fieldset.getBoundingClientRect = () => ({
        width: 780,
        height: 68,
        top: 790,
        bottom: 858,
        left: 330,
        right: 1110,
        x: 330,
        y: 790,
        toJSON: () => {},
      });

      const found = findComposerElement('claude');
      expect(found).toBe(fieldset);
    });
  });

  describe('computeComposerAnchorPosition', () => {
    it('positions ball at rect.right + 14px and vertically centered for compact composer', () => {
      const mockEl = document.createElement('div');
      mockEl.getBoundingClientRect = () => ({
        width: 768,
        height: 64,
        top: 800,
        bottom: 864,
        left: 336,
        right: 1104,
        x: 336,
        y: 800,
        toJSON: () => {},
      });

      const ballSize = { width: 76, height: 76 };
      const pos = computeComposerAnchorPosition(mockEl, ballSize, 14);

      expect(pos.x).toBe(1118);
      expect(pos.y).toBe(794);
    });

    it('aligns to bottom of tall multi-line composer', () => {
      const mockEl = document.createElement('div');
      mockEl.getBoundingClientRect = () => ({
        width: 768,
        height: 200,
        top: 650,
        bottom: 850,
        left: 336,
        right: 1104,
        x: 336,
        y: 650,
        toJSON: () => {},
      });

      const ballSize = { width: 76, height: 76 };
      const pos = computeComposerAnchorPosition(mockEl, ballSize, 14);

      expect(pos.x).toBe(1118);
      expect(pos.y).toBe(770);
    });

    it('clamps inside viewport if composer extends too close to edge', () => {
      const mockEl = document.createElement('div');
      mockEl.getBoundingClientRect = () => ({
        width: 1200,
        height: 64,
        top: 800,
        bottom: 864,
        left: 220,
        right: 1420,
        x: 220,
        y: 800,
        toJSON: () => {},
      });

      const ballSize = { width: 76, height: 76 };
      const pos = computeComposerAnchorPosition(mockEl, ballSize, 14);

      // Max X is 1440 - 76 - 8 = 1356
      expect(pos.x).toBe(1356);
    });
    it('adapts to left side when right side is cramped and allowAdaptiveSide is true', () => {
      const mockEl = document.createElement('div');
      mockEl.getBoundingClientRect = () => ({
        width: 1100,
        height: 64,
        top: 800,
        bottom: 864,
        left: 280,
        right: 1380, // right space is 1440 - 1380 = 60px (< 76 + 14 + 8)
        x: 280,
        y: 800,
        toJSON: () => {},
      });

      const ballSize = { width: 76, height: 76 };
      const pos = computeComposerAnchorPosition(mockEl, ballSize, { gap: 14, allowAdaptiveSide: true });

      // Left space: 280 - 14 - 76 = 190
      expect(pos.x).toBe(190);
    });

    it('floats above composer when both sides are cramped and allowAdaptiveSide is true', () => {
      const mockEl = document.createElement('div');
      mockEl.getBoundingClientRect = () => ({
        width: 1400,
        height: 64,
        top: 800,
        bottom: 864,
        left: 20,
        right: 1420,
        x: 20,
        y: 800,
        toJSON: () => {},
      });

      const ballSize = { width: 76, height: 76 };
      const pos = computeComposerAnchorPosition(mockEl, ballSize, { gap: 14, allowAdaptiveSide: true });

      // Above: rect.top (800) - 76 - 14 = 710
      expect(pos.y).toBe(710);
    });
  });
});
