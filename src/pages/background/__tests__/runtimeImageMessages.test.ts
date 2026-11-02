import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleRuntimeImageMessage, isRuntimeImageMessage } from '../runtimeImageMessages';

const SENDER = { id: 'ext-id', tab: { id: 7, url: 'https://gemini.google.com/app/1' } };
const IMAGE_URL = 'https://lh3.googleusercontent.com/a.png';

function imageResponse(bytes: number[], headers: Record<string, string> = {}): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'Content-Type': 'image/png', ...headers },
  });
}

describe('runtime image messages', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', { runtime: { id: 'ext-id' } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recognises only the image fetch message types', () => {
    expect(isRuntimeImageMessage({ type: 'gv.fetchImage' })).toBe(true);
    expect(isRuntimeImageMessage({ type: 'gv.fetchImageViaPage' })).toBe(true);
    expect(isRuntimeImageMessage({ type: 'gv.other' })).toBe(false);
    expect(isRuntimeImageMessage(null)).toBe(false);
  });

  it('returns the image as a data URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => imageResponse([1, 2, 3])),
    );

    const res = await handleRuntimeImageMessage({ type: 'gv.fetchImage', url: IMAGE_URL }, SENDER);

    expect(res).toEqual({
      ok: true,
      contentType: 'image/png',
      base64: 'AQID',
      data: 'data:image/png;base64,AQID',
    });
  });

  it('refuses a sender from another extension', async () => {
    const res = await handleRuntimeImageMessage(
      { type: 'gv.fetchImage', url: IMAGE_URL },
      { ...SENDER, id: 'other' },
    );
    expect(res).toEqual({ ok: false, error: 'untrusted_sender' });
  });

  it('refuses a host outside the allow-list and the sender page', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const res = await handleRuntimeImageMessage(
      { type: 'gv.fetchImage', url: 'https://evil.example/a.png' },
      SENDER,
    );

    expect(res).toEqual({ ok: false, error: 'url_not_allowed' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses a body that is not an image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => imageResponse([1], { 'Content-Type': 'text/html' })),
    );

    const res = await handleRuntimeImageMessage({ type: 'gv.fetchImage', url: IMAGE_URL }, SENDER);

    expect(res).toEqual({ ok: false, error: 'unexpected_content' });
  });

  it('retries without credentials when the credentialed fetch fails', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(imageResponse([9]));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await handleRuntimeImageMessage({ type: 'gv.fetchImage', url: IMAGE_URL }, SENDER);

    expect(res.ok).toBe(true);
    expect(fetchSpy.mock.calls.map((c) => c[1].credentials)).toEqual(['include', 'omit']);
  });

  it('reports the page fetch as unavailable without the scripting API', async () => {
    const res = await handleRuntimeImageMessage(
      { type: 'gv.fetchImageViaPage', url: IMAGE_URL },
      SENDER,
    );
    expect(res).toEqual({ ok: false, error: 'scripting_api_unavailable' });
  });
});
