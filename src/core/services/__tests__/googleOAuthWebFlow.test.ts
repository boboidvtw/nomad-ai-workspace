import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { GOOGLE_OAUTH_RELAY_URL, runGoogleWebAuthFlow } from '../googleOAuthWebFlow';

const CHROME_ID = 'iifacdnjakkhjjiengaffnegbndgingi';
const CHROME_REDIRECT = `https://${CHROME_ID}.chromiumapp.org/`;
const FIREFOX_REDIRECT = 'https://0123abcd.extensions.allizom.org/';

function answerWith(fragment: (request: URL) => string) {
  return vi.fn(async (url: string) => {
    const request = new URL(url);
    return `${request.searchParams.get('redirect_uri')}#${fragment(request)}`;
  });
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return btoa(String.fromCharCode(...digest))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('runGoogleWebAuthFlow', () => {
  it('sends Chromium through the relay and accepts only its own state', async () => {
    const launch = answerWith(
      (request) => `access_token=tok&expires_in=1800&state=${request.searchParams.get('state')}`,
    );

    const granted = await runGoogleWebAuthFlow({
      clientId: 'web-client',
      scopes: 'drive.file',
      redirectURL: CHROME_REDIRECT,
      launch,
    });

    expect(granted).toEqual({ accessToken: 'tok', expiresIn: 1800 });
    const request = new URL(launch.mock.calls[0][0]);
    expect(request.searchParams.get('redirect_uri')).toBe(GOOGLE_OAUTH_RELAY_URL);
    expect(request.searchParams.get('response_type')).toBe('token');
    expect(request.searchParams.get('state')).toMatch(new RegExp(`^${CHROME_ID}\\.[\\w-]{16,}$`));
  });

  it('drops a token whose state does not match the request', async () => {
    const granted = await runGoogleWebAuthFlow({
      clientId: 'web-client',
      scopes: 'drive.file',
      redirectURL: CHROME_REDIRECT,
      launch: answerWith(() => `access_token=forged&state=${CHROME_ID}.someoneElsesNonce1234`),
    });

    expect(granted).toBeNull();
  });

  it('uses the Firefox loopback with PKCE and exchanges the code', async () => {
    const launch = answerWith(
      (request) => `code=auth-code&state=${request.searchParams.get('state')}`,
    );
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ access_token: 'ff-token', expires_in: 3599 }), {
          status: 200,
        }),
    );

    const granted = await runGoogleWebAuthFlow({
      clientId: 'web-client',
      scopes: 'drive.file',
      redirectURL: FIREFOX_REDIRECT,
      launch,
      desktopClient: { id: 'desktop-client', secret: 'desktop-secret' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(granted).toEqual({ accessToken: 'ff-token', expiresIn: 3599 });
    const request = new URL(launch.mock.calls[0][0]);
    expect(request.searchParams.get('client_id')).toBe('desktop-client');
    expect(request.searchParams.get('redirect_uri')).toBe('http://127.0.0.1/mozoauth2/0123abcd');
    expect(request.searchParams.get('response_type')).toBe('code');
    expect(request.searchParams.get('code_challenge_method')).toBe('S256');

    const [endpoint, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe('https://oauth2.googleapis.com/token');
    const body = init.body as URLSearchParams;
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('redirect_uri')).toBe('http://127.0.0.1/mozoauth2/0123abcd');
    expect(await sha256Base64Url(body.get('code_verifier') ?? '')).toBe(
      request.searchParams.get('code_challenge'),
    );
  });

  it('keeps the legacy Firefox redirect until the desktop client exists', async () => {
    const launch = answerWith(
      (request) => `access_token=legacy&state=${request.searchParams.get('state')}`,
    );

    const granted = await runGoogleWebAuthFlow({
      clientId: 'web-client',
      scopes: 'drive.file',
      redirectURL: FIREFOX_REDIRECT,
      launch,
      desktopClient: { id: '', secret: '' },
    });

    expect(granted?.accessToken).toBe('legacy');
    expect(new URL(launch.mock.calls[0][0]).searchParams.get('redirect_uri')).toBe(
      FIREFOX_REDIRECT,
    );
  });
});

describe('voyager.nagi.fun OAuth relay page', () => {
  const code = readFileSync(resolve(process.cwd(), 'docs/public/oauth/callback/relay.js'), 'utf8');

  function openRelay(href: string) {
    const replace = vi.fn();
    const status = { textContent: '' };
    const fakeWindow = {
      location: { href, replace },
      document: { getElementById: () => status },
    };
    new Function('window', code)(fakeWindow);
    return { replace, status };
  }

  it('forwards the whole answer to an allowlisted extension', () => {
    const { replace } = openRelay(
      `https://voyager.nagi.fun/oauth/callback/?authuser=0#access_token=tok&state=${CHROME_ID}.abcdefghijklmnop`,
    );

    expect(replace).toHaveBeenCalledWith(
      `https://${CHROME_ID}.chromiumapp.org/?authuser=0#access_token=tok&state=${CHROME_ID}.abcdefghijklmnop`,
    );
  });

  it('forwards an error that Google put in the query', () => {
    const { replace } = openRelay(
      `https://voyager.nagi.fun/oauth/callback/?error=access_denied&state=${CHROME_ID}.abcdefghijklmnop`,
    );

    expect(replace).toHaveBeenCalledWith(
      `https://${CHROME_ID}.chromiumapp.org/?error=access_denied&state=${CHROME_ID}.abcdefghijklmnop`,
    );
  });

  it('refuses extensions outside the allowlist and malformed state', () => {
    for (const state of [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.abcdefghijklmnop',
      `${CHROME_ID}.short`,
      'evil.example.com/#',
      '',
    ]) {
      const { replace, status } = openRelay(
        `https://voyager.nagi.fun/oauth/callback/#access_token=tok&state=${encodeURIComponent(state)}`,
      );
      expect(replace).not.toHaveBeenCalled();
      expect(status.textContent).toMatch(/not valid/);
    }
  });
});
