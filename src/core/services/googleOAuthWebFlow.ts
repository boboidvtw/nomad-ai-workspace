/**
 * Google OAuth through `identity.launchWebAuthFlow`.
 *
 * Google only verifies a brand whose redirect URIs live on domains we own, so
 * no `*.chromiumapp.org` or `*.extensions.allizom.org` URI may be registered.
 *
 * - Chromium sends Google to a static relay on voyager.nagi.fun
 *   (`docs/public/oauth/callback/`). The relay forwards the whole response to
 *   `https://<id>.chromiumapp.org/`, where launchWebAuthFlow catches it.
 *   Chromium does not check the `redirect_uri` parameter, only the final hop.
 * - Firefox rejects any `redirect_uri` that is not `getRedirectURL()` or its
 *   loopback `http://127.0.0.1/mozoauth2/<hash>` (child/ext-identity.js), so it
 *   uses the loopback with a Desktop OAuth client and the code flow with PKCE.
 *   Firefox cancels that request before it leaves the browser.
 */

export const GOOGLE_OAUTH_RELAY_URL = 'https://voyager.nagi.fun/oauth/callback/';
const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

/**
 * Desktop-type client used only by Firefox. Google does not treat an installed
 * app's secret as confidential (RFC 8252); PKCE is what protects the code. The
 * secret still stays out of the repository: only the Firefox build injects it
 * from `VOYAGER_FIREFOX_OAUTH_CLIENT_SECRET`. Without it, Firefox keeps its
 * legacy redirect.
 */
function firefoxClientSecret(): string {
  try {
    // Keep this access static so Vite can replace it at build time.
    const value: unknown = import.meta.env.VOYAGER_FIREFOX_OAUTH_CLIENT_SECRET;
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

export const FIREFOX_DESKTOP_OAUTH_CLIENT = {
  id: '462948120910-ie15573ui4srfhcn94pkiesnf7fl7f8b.apps.googleusercontent.com',
  secret: firefoxClientSecret(),
} as const;

export interface GoogleAccessToken {
  accessToken: string;
  expiresIn: number;
}

export interface WebAuthFlowOptions {
  clientId: string;
  scopes: string;
  /** `identity.getRedirectURL()` */
  redirectURL: string;
  launch: (url: string) => Promise<string>;
  desktopClient?: { id: string; secret: string };
  fetchImpl?: typeof fetch;
}

type RedirectKind =
  | { kind: 'chromium'; extensionId: string }
  | { kind: 'firefox'; loopbackURL: string }
  | { kind: 'unknown' };

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(byteLength = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

function classifyRedirect(redirectURL: string): RedirectKind {
  let host = '';
  try {
    host = new URL(redirectURL).hostname;
  } catch {
    return { kind: 'unknown' };
  }
  const chromium = /^([a-p]{32})\.chromiumapp\.org$/.exec(host);
  if (chromium) return { kind: 'chromium', extensionId: chromium[1] };
  const firefox = /^([0-9a-f]+)\.extensions\.allizom\.org$/.exec(host);
  if (firefox) return { kind: 'firefox', loopbackURL: `http://127.0.0.1/mozoauth2/${firefox[1]}` };
  return { kind: 'unknown' };
}

/** Google returns implicit-flow results in the fragment, but some errors in the query. */
function responseParams(responseURL: string): URLSearchParams {
  const url = new URL(responseURL);
  const params = new URLSearchParams(url.search);
  new URLSearchParams(url.hash.slice(1)).forEach((value, key) => params.set(key, value));
  return params;
}

function authUrl(params: Record<string, string>): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function readExpiresIn(value: unknown): number {
  const seconds = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
    ? seconds
    : DEFAULT_EXPIRES_IN_SECONDS;
}

async function implicitFlow(
  options: WebAuthFlowOptions,
  redirectUri: string,
  state: string | null,
): Promise<GoogleAccessToken | null> {
  const request: Record<string, string> = {
    client_id: options.clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: options.scopes,
  };
  if (state) request.state = state;
  const params = responseParams(await options.launch(authUrl(request)));
  // A response without our state may come from a page we never opened.
  if (state && params.get('state') !== state) return null;
  const accessToken = params.get('access_token');
  return accessToken ? { accessToken, expiresIn: readExpiresIn(params.get('expires_in')) } : null;
}

async function loopbackCodeFlow(
  options: WebAuthFlowOptions,
  loopbackURL: string,
  client: { id: string; secret: string },
): Promise<GoogleAccessToken | null> {
  const state = randomToken();
  const verifier = randomToken(48);
  const challenge = base64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  const params = responseParams(
    await options.launch(
      authUrl({
        client_id: client.id,
        redirect_uri: loopbackURL,
        response_type: 'code',
        scope: options.scopes,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }),
    ),
  );
  const code = params.get('code');
  if (params.get('state') !== state || !code) return null;

  const response = await (options.fetchImpl ?? fetch)(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: loopbackURL,
    }),
  });
  if (!response.ok) throw new Error(`Google token exchange failed: ${response.status}`);
  const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown };
  return typeof body.access_token === 'string' && body.access_token
    ? { accessToken: body.access_token, expiresIn: readExpiresIn(body.expires_in) }
    : null;
}

export async function runGoogleWebAuthFlow(
  options: WebAuthFlowOptions,
): Promise<GoogleAccessToken | null> {
  const redirect = classifyRedirect(options.redirectURL);
  if (redirect.kind === 'chromium') {
    // The relay reads the extension id from `state` and only forwards to its
    // allowlist; the nonce ties the answer to this request.
    return implicitFlow(
      options,
      GOOGLE_OAUTH_RELAY_URL,
      `${redirect.extensionId}.${randomToken()}`,
    );
  }
  const desktopClient = options.desktopClient ?? FIREFOX_DESKTOP_OAUTH_CLIENT;
  if (redirect.kind === 'firefox' && desktopClient.id && desktopClient.secret) {
    return loopbackCodeFlow(options, redirect.loopbackURL, desktopClient);
  }
  return implicitFlow(options, options.redirectURL, randomToken());
}
