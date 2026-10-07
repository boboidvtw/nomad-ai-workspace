/**
 * Nomad Shared Core - Local HTTP Gateway Authentication
 *
 * Protects the loopback HTTP servers (Daemon :8765 & Studio Bridge) against:
 *  - Cross-site requests from arbitrary web pages (CSRF / drive-by API calls)
 *  - DNS rebinding (attacker domain resolving to 127.0.0.1)
 *  - Unauthenticated local API use
 *
 * Model: a random bearer token is persisted at ~/.nomad/daemon-token (0600) and
 * shared by every Nomad process of the same user. Clients send it via
 * `Authorization: Bearer <token>`, `X-Nomad-Token: <token>` or `?token=<token>`
 * (the query form exists for EventSource, which cannot set headers).
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULT_DAEMON_PORT } = require('../constants');

const TOKEN_ENV_VAR = 'NOMAD_DAEMON_TOKEN';
const TOKEN_FILE_ENV_VAR = 'NOMAD_DAEMON_TOKEN_FILE';
const LOOPBACK_HOSTNAMES = Object.freeze(['127.0.0.1', 'localhost', '::1', '[::1]']);

function getTokenFilePath() {
  return process.env[TOKEN_FILE_ENV_VAR] || path.join(os.homedir(), '.nomad', 'daemon-token');
}

/**
 * Resolves the shared auth token: explicit value > env var > token file (created on first use).
 * @param {string} [explicitToken]
 * @returns {string}
 */
function resolveAuthToken(explicitToken) {
  if (explicitToken) return String(explicitToken);
  if (process.env[TOKEN_ENV_VAR]) return process.env[TOKEN_ENV_VAR];

  const filePath = getTokenFilePath();
  try {
    const existing = fs.readFileSync(filePath, 'utf-8').trim();
    if (existing.length >= 32) return existing;
  } catch {}

  const token = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(filePath, token + '\n', { mode: 0o600 });
  return token;
}

/**
 * @param {unknown} hostname
 * @returns {boolean}
 */
function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTNAMES.includes(String(hostname || '').toLowerCase());
}

/**
 * True when every caller-supplied target in a local-model request (`host`, `endpoint`) is loopback.
 * Prevents the gateway from being used as an SSRF relay to LAN / internet hosts.
 * @param {{ host?: string, endpoint?: string }} [target]
 * @returns {boolean}
 */
function isLoopbackModelTarget({ host, endpoint } = {}) {
  if (host && !isLoopbackHostname(host)) return false;
  if (endpoint) {
    try {
      const parsed = new URL(endpoint);
      if (!['http:', 'https:'].includes(parsed.protocol) || !isLoopbackHostname(parsed.hostname))
        return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Strips the port from a Host header value ("127.0.0.1:8765", "[::1]:8765").
 * @param {string | undefined} hostHeader
 * @returns {string}
 */
function hostnameFromHostHeader(hostHeader) {
  const value = String(hostHeader || '')
    .trim()
    .toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end === -1 ? value : value.slice(0, end + 1);
  }
  return value.split(':')[0];
}

/**
 * Host header guard against DNS rebinding. A missing header (HTTP/1.0) is allowed.
 * @param {string|undefined} hostHeader
 * @param {string} [boundHost] - Server bind address; accepted too when it is a concrete address.
 */
function isAllowedHostHeader(hostHeader, boundHost) {
  if (!hostHeader) return true;
  const hostname = hostnameFromHostHeader(hostHeader);
  if (isLoopbackHostname(hostname)) return true;
  return (
    Boolean(boundHost) &&
    boundHost !== '0.0.0.0' &&
    boundHost !== '::' &&
    hostname === String(boundHost).toLowerCase()
  );
}

/**
 * Browser origins allowed to call the API: pages served from a loopback http(s) origin.
 * Requests without an Origin header (curl, Node clients) pass this check and rely on the token.
 * @param {string | undefined} origin
 * @returns {boolean}
 */
function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      isLoopbackHostname(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {URL} url
 * @returns {string}
 */
function extractToken(req, url) {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  const headerToken = req.headers['x-nomad-token'];
  if (typeof headerToken === 'string' && headerToken) return headerToken.trim();
  return url.searchParams.get('token') || '';
}

/**
 * Constant-time token comparison.
 * @param {string} provided
 * @param {string} expected
 * @returns {boolean}
 */
function tokensMatch(provided, expected) {
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

/**
 * Sets CORS headers: the request Origin is reflected only when it is an allowed loopback origin.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {boolean} [publicRoute] - Read-only health routes answer any origin with `*`.
 */
function applyCorsHeaders(req, res, publicRoute = false) {
  const origin = req.headers['origin'];
  res.setHeader('Vary', 'Origin');
  if (publicRoute) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Nomad-Token, X-Requested-With',
  );
}

/**
 * Decides whether a request may proceed.
 * @param {import('http').IncomingMessage} req
 * @param {URL} url
 * Public routes skip origin & token checks; CORS preflights (OPTIONS) carry no credentials,
 * so they skip only the token check.
 * @param {{ token: string, boundHost?: string, publicRoute?: boolean }} options
 * @returns {{ allowed: true } | { allowed: false, status: number, reason: string }}
 */
function authorizeRequest(req, url, { token, boundHost, publicRoute = false }) {
  if (!isAllowedHostHeader(req.headers['host'], boundHost)) {
    return { allowed: false, status: 403, reason: 'Host header not allowed' };
  }
  if (publicRoute) return { allowed: true };
  if (!isAllowedOrigin(req.headers['origin'])) {
    return { allowed: false, status: 403, reason: 'Origin not allowed' };
  }
  if (req.method === 'OPTIONS') return { allowed: true };
  if (!tokensMatch(extractToken(req, url), token)) {
    return { allowed: false, status: 401, reason: 'Missing or invalid Nomad auth token' };
  }
  return { allowed: true };
}

/**
 * Injects the auth token into the dashboard HTML, plus a fetch/EventSource shim that attaches it
 * to requests aimed at the Nomad gateway ports on loopback (other local services never see it).
 * @param {string} html
 * @param {string} token
 * @param {number[]} [gatewayPorts]
 */
function injectDashboardAuth(html, token, gatewayPorts = [DEFAULT_DAEMON_PORT]) {
  const config = JSON.stringify({ token, ports: gatewayPorts.map(String) }).replace(
    /</g,
    '\\u003c',
  );
  const shim =
    '<script>(function(){' +
    'var C=' +
    config +
    ';window.__NOMAD_TOKEN__=C.token;' +
    'function gw(u){try{var x=new URL(u,location.href);var p=x.port||(x.protocol==="https:"?"443":"80");' +
    'return /^(127\\.0\\.0\\.1|localhost|\\[::1\\])$/.test(x.hostname)&&(x.origin===location.origin||C.ports.indexOf(p)!==-1);}catch(e){return false;}}' +
    'var F=window.fetch;if(F){window.fetch=function(i,o){var u=typeof i==="string"?i:(i&&i.url);' +
    'if(gw(u)&&!(o&&o.mode==="no-cors")){o=Object.assign({},o);var h=new Headers(o.headers||(typeof i!=="string"&&i.headers)||undefined);' +
    'if(!h.has("Authorization"))h.set("Authorization","Bearer "+C.token);o.headers=h;}return F.call(window,i,o);};}' +
    'var E=window.EventSource;if(E){var W=function(u,c){if(gw(u)){var x=new URL(u,location.href);x.searchParams.set("token",C.token);u=x.toString();}return new E(u,c);};' +
    'W.prototype=E.prototype;W.CONNECTING=E.CONNECTING;W.OPEN=E.OPEN;W.CLOSED=E.CLOSED;window.EventSource=W;}' +
    '})();</script>';

  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const at = (headMatch.index ?? 0) + headMatch[0].length;
    return html.slice(0, at) + shim + html.slice(at);
  }
  return shim + html;
}

module.exports = {
  TOKEN_ENV_VAR,
  TOKEN_FILE_ENV_VAR,
  getTokenFilePath,
  resolveAuthToken,
  isLoopbackHostname,
  isLoopbackModelTarget,
  isAllowedHostHeader,
  isAllowedOrigin,
  extractToken,
  tokensMatch,
  applyCorsHeaders,
  authorizeRequest,
  injectDashboardAuth,
};
