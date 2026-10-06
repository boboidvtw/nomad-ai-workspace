export const TOKEN_ENV_VAR: "NOMAD_DAEMON_TOKEN";
export const TOKEN_FILE_ENV_VAR: "NOMAD_DAEMON_TOKEN_FILE";
export function getTokenFilePath(): string;
/**
 * Resolves the shared auth token: explicit value > env var > token file (created on first use).
 * @param {string} [explicitToken]
 * @returns {string}
 */
export function resolveAuthToken(explicitToken?: string): string;
/**
 * @param {unknown} hostname
 * @returns {boolean}
 */
export function isLoopbackHostname(hostname: unknown): boolean;
/**
 * True when every caller-supplied target in a local-model request (`host`, `endpoint`) is loopback.
 * Prevents the gateway from being used as an SSRF relay to LAN / internet hosts.
 * @param {{ host?: string, endpoint?: string }} [target]
 * @returns {boolean}
 */
export function isLoopbackModelTarget({ host, endpoint }?: {
    host?: string;
    endpoint?: string;
}): boolean;
/**
 * Host header guard against DNS rebinding. A missing header (HTTP/1.0) is allowed.
 * @param {string|undefined} hostHeader
 * @param {string} [boundHost] - Server bind address; accepted too when it is a concrete address.
 */
export function isAllowedHostHeader(hostHeader: string | undefined, boundHost?: string): boolean;
/**
 * Browser origins allowed to call the API: pages served from a loopback http(s) origin.
 * Requests without an Origin header (curl, Node clients) pass this check and rely on the token.
 * @param {string | undefined} origin
 * @returns {boolean}
 */
export function isAllowedOrigin(origin: string | undefined): boolean;
/**
 * @param {import('http').IncomingMessage} req
 * @param {URL} url
 * @returns {string}
 */
export function extractToken(req: import("http").IncomingMessage, url: URL): string;
/**
 * Constant-time token comparison.
 * @param {string} provided
 * @param {string} expected
 * @returns {boolean}
 */
export function tokensMatch(provided: string, expected: string): boolean;
/**
 * Sets CORS headers: the request Origin is reflected only when it is an allowed loopback origin.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {boolean} [publicRoute] - Read-only health routes answer any origin with `*`.
 */
export function applyCorsHeaders(req: import("http").IncomingMessage, res: import("http").ServerResponse, publicRoute?: boolean): void;
/**
 * Decides whether a request may proceed.
 * @param {import('http').IncomingMessage} req
 * @param {URL} url
 * Public routes skip origin & token checks; CORS preflights (OPTIONS) carry no credentials,
 * so they skip only the token check.
 * @param {{ token: string, boundHost?: string, publicRoute?: boolean }} options
 * @returns {{ allowed: true } | { allowed: false, status: number, reason: string }}
 */
export function authorizeRequest(req: import("http").IncomingMessage, url: URL, { token, boundHost, publicRoute }: {
    token: string;
    boundHost?: string;
    publicRoute?: boolean;
}): {
    allowed: true;
} | {
    allowed: false;
    status: number;
    reason: string;
};
/**
 * Injects the auth token into the dashboard HTML, plus a fetch/EventSource shim that attaches it
 * to requests aimed at the Nomad gateway ports on loopback (other local services never see it).
 * @param {string} html
 * @param {string} token
 * @param {number[]} [gatewayPorts]
 */
export function injectDashboardAuth(html: string, token: string, gatewayPorts?: number[]): string;
