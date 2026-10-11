/**
 * Nomad Shared Core - Canonical chat URL rules (SPEC-AGENT-BOTS M2)
 * Only URLs that look like a real conversation on a known platform may be bound to a bot,
 * so a bot binding can never send a logged-in webview to an arbitrary page.
 */
/** @type {Readonly<Record<string, string>>} */
export const NEW_CHAT_URLS: Readonly<Record<string, string>>;
/** @type {Readonly<Record<string, RegExp>>} */
export const CONVERSATION_PATTERNS: Readonly<Record<string, RegExp>>;
/**
 * Drops query string, hash and trailing slash.
 * @param {string | null | undefined} url
 * @returns {string}
 */
export function normalizeChatUrl(url: string | null | undefined): string;
/**
 * @param {string} platform
 * @param {string | null | undefined} url
 * @returns {boolean}
 */
export function isConversationUrl(platform: string, url: string | null | undefined): boolean;
/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {boolean}
 */
export function isSameConversation(a: string | null | undefined, b: string | null | undefined): boolean;
