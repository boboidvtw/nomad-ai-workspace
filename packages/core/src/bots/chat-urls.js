/**
 * Nomad Shared Core - Canonical chat URL rules (SPEC-AGENT-BOTS M2)
 * Only URLs that look like a real conversation on a known platform may be bound to a bot,
 * so a bot binding can never send a logged-in webview to an arbitrary page.
 */

/** @type {Readonly<Record<string, string>>} */
const NEW_CHAT_URLS = Object.freeze({
  claude: 'https://claude.ai/new',
  chatgpt: 'https://chatgpt.com/',
  gemini: 'https://gemini.google.com/app',
  grok: 'https://grok.com/',
});

/** @type {Readonly<Record<string, RegExp>>} */
const CONVERSATION_PATTERNS = Object.freeze({
  claude: /^https:\/\/claude\.ai\/chat\/[A-Za-z0-9-]+$/,
  chatgpt: /^https:\/\/chatgpt\.com\/(?:g\/[A-Za-z0-9-]+\/)?c\/[A-Za-z0-9-]+$/,
  gemini: /^https:\/\/gemini\.google\.com\/(?:u\/\d+\/)?app\/[A-Za-z0-9]+$/,
  grok: /^https:\/\/grok\.com\/(?:c|chat)\/[A-Za-z0-9-]+$/,
});

/**
 * Drops query string, hash and trailing slash.
 * @param {string | null | undefined} url
 * @returns {string}
 */
function normalizeChatUrl(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

/**
 * @param {string} platform
 * @param {string | null | undefined} url
 * @returns {boolean}
 */
function isConversationUrl(platform, url) {
  const pattern = CONVERSATION_PATTERNS[platform];
  return Boolean(pattern && pattern.test(normalizeChatUrl(url)));
}

/**
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {boolean}
 */
function isSameConversation(a, b) {
  const left = normalizeChatUrl(a);
  return left !== '' && left === normalizeChatUrl(b);
}

module.exports = {
  NEW_CHAT_URLS,
  CONVERSATION_PATTERNS,
  normalizeChatUrl,
  isConversationUrl,
  isSameConversation,
};
