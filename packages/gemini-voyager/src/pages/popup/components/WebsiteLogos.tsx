import React from 'react';

import { PLATFORM_LOGOS, type PlatformLogoId } from '@/core/icons/platformLogos';

/**
 * The popup's renderer for the shared platform marks. Geometry lives in
 * `core/icons/platformLogos` because the changelog draws the same marks in a
 * content script, without React.
 */
function logo(id: PlatformLogoId): () => React.JSX.Element {
  const { viewBox, paths } = PLATFORM_LOGOS[id];
  const Logo = (): React.JSX.Element => (
    <svg viewBox={viewBox} width="100%" height="100%" fill="currentColor">
      {paths.map((d) => (
        <path key={d.slice(0, 24)} d={d} />
      ))}
    </svg>
  );
  return Logo;
}

export const IconChatGPT = logo('chatgpt');
export const IconClaude = logo('claude');
export const IconDeepSeek = logo('deepseek');
export const IconQwen = logo('qwen');
export const IconKimi = logo('kimi');
export const IconAIStudio = logo('aistudio');
export const IconGemini = logo('gemini');
export const IconNotebookLM = logo('notebooklm');
export const IconMidjourney = logo('midjourney');
export const IconPerplexity = logo('perplexity');
