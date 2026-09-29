import { describe, expect, it } from 'vitest';

import { PLATFORM_LOGOS } from '@/core/icons/platformLogos';

import { renderPlatformLogoMarks } from '../platformLogoMarks';

function body(html: string): HTMLElement {
  const element = document.createElement('div');
  element.innerHTML = html;
  return element;
}

describe('platform logo marks', () => {
  it('draws the platform mark where the marker sat, keeping the sentence intact', () => {
    const root = body('<li><strong>:chatgpt: ChatGPT export</strong>: a blank turn.</li>');

    renderPlatformLogoMarks(root);

    const svg = root.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe(PLATFORM_LOGOS.chatgpt.viewBox);
    expect(svg?.querySelector('path')?.getAttribute('d')).toBe(PLATFORM_LOGOS.chatgpt.paths[0]);
    expect(svg?.parentElement?.tagName).toBe('STRONG');
    // The space written after the marker is consumed: the mark brings its own.
    expect(root.textContent).toBe('ChatGPT export: a blank turn.');
  });

  it('marks every platform named in one sentence', () => {
    const root = body(
      '<p>:deepseek: DeepSeek blue, :claude: Claude clay, :gemini: Gemini green.</p>',
    );

    renderPlatformLogoMarks(root);

    expect([...root.querySelectorAll('svg')].map((s) => s.getAttribute('viewBox'))).toEqual([
      PLATFORM_LOGOS.deepseek.viewBox,
      PLATFORM_LOGOS.claude.viewBox,
      PLATFORM_LOGOS.gemini.viewBox,
    ]);
  });

  it('draws every path of a mark built from more than one', () => {
    const root = body('<p>:aistudio: AI Studio</p>');

    renderPlatformLogoMarks(root);

    expect(root.querySelectorAll('path')).toHaveLength(PLATFORM_LOGOS.aistudio.paths.length);
  });

  it("keeps a space that is not the marker's own", () => {
    const root = body('<p>on :gemini: Gemini and :claude:Claude alike</p>');

    renderPlatformLogoMarks(root);

    expect(root.textContent).toBe('on Gemini and Claude alike');
  });

  it('leaves text that names no platform alone', () => {
    const root = body('<p>Firefox 115 cannot parse it. 09:30: not a marker.</p>');

    renderPlatformLogoMarks(root);

    expect(root.querySelector('svg')).toBeNull();
    expect(root.textContent).toBe('Firefox 115 cannot parse it. 09:30: not a marker.');
  });
});
