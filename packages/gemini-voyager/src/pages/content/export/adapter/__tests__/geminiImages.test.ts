import { describe, expect, it } from 'vitest';

import { resolveGeminiImageSrc } from '../platform/geminiImages';

describe('resolveGeminiImageSrc', () => {
  it('skips about:blank and 1x1 gif placeholders in favor of data-src', () => {
    const image = document.createElement('img');
    image.setAttribute('src', 'about:blank');
    image.setAttribute('data-src', 'https://gstatic.example/real.jpg');

    expect(resolveGeminiImageSrc(image)).toBe('https://gstatic.example/real.jpg');
  });

  it('reads data-full-size-image-uri from the host when the img src is empty', () => {
    const host = document.createElement('div');
    host.setAttribute('data-full-size-image-uri', 'https://example.com/full.jpg');
    const image = document.createElement('img');
    host.appendChild(image);

    expect(resolveGeminiImageSrc(image, host)).toBe('https://example.com/full.jpg');
  });
});
