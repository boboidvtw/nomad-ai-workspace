/**
 * Nomad Shared Core - Blocked-state manifests (SPEC-AGENT-BOTS M3)
 * Data, not code: when a platform changes its UI, edit the rules here. The page-side script
 * only collects a snapshot (URL, alert/dialog text, which selectors match); the decision is
 * made in Node by detectBlocked(), so rules stay testable without a browser.
 *
 * Text rules only look at alert, dialog, banner and status regions, never at message bodies,
 * so an AI reply that merely mentions "rate limit" does not count as blocked.
 */

/**
 * @typedef {{ id: string, type: 'url', pattern: string, reason: string }} UrlRule
 * @typedef {{ id: string, type: 'text', pattern: string, reason: string }} TextRule
 * @typedef {{ id: string, type: 'selector', selector: string, reason: string }} SelectorRule
 * @typedef {UrlRule | TextRule | SelectorRule} BlockedRule
 * @typedef {{ rules: BlockedRule[] }} BlockedManifest
 *
 * @typedef {Object} StateSnapshot
 * @property {string} url
 * @property {string[]} notices - text of alert/dialog/banner/status regions
 * @property {string[]} selectorHits - ids of selector rules that matched
 *
 * @typedef {{ blocked: false } | { blocked: true, ruleId: string, reason: string }} BlockedVerdict
 */

/** Regions whose text can signal a blocked state. */
const NOTICE_SELECTOR =
  '[role="alert"], [role="alertdialog"], [role="dialog"], [role="status"], [role="banner"]';
const MAX_NOTICE_LENGTH = 500;
const MAX_NOTICES = 20;

/** @type {Readonly<Record<string, BlockedManifest>>} */
const BLOCKED_MANIFESTS = Object.freeze({
  claude: {
    rules: [
      {
        id: 'signed-out',
        type: 'url',
        pattern: '^https://claude\\.ai/(login|logout)',
        reason: 'Signed out of Claude; sign in again',
      },
      {
        id: 'usage-limit',
        type: 'text',
        pattern: '(reached|hit) your (usage|message) limit|out of (free )?messages|usage limit',
        reason: 'Claude usage limit reached',
      },
      {
        id: 'rate-limit',
        type: 'text',
        pattern: 'rate limit|too many requests',
        reason: 'Claude is rate limiting requests',
      },
    ],
  },
  chatgpt: {
    rules: [
      {
        id: 'signed-out',
        type: 'url',
        pattern: '^https://(chatgpt\\.com|auth\\.openai\\.com)/(auth/)?(login|log-in)',
        reason: 'Signed out of ChatGPT; sign in again',
      },
      {
        id: 'login-button',
        type: 'selector',
        selector: '[data-testid="login-button"]',
        reason: 'ChatGPT shows a sign-in button',
      },
      {
        id: 'usage-limit',
        type: 'text',
        pattern: '(reached|hit) (the current |your )?(usage cap|limit)',
        reason: 'ChatGPT usage cap reached',
      },
      {
        id: 'rate-limit',
        type: 'text',
        pattern: 'too many requests|rate limit',
        reason: 'ChatGPT is rate limiting requests',
      },
    ],
  },
  gemini: {
    rules: [
      {
        id: 'signed-out',
        type: 'url',
        pattern: '^https://accounts\\.google\\.com/',
        reason: 'Signed out of Google; sign in again',
      },
      {
        id: 'usage-limit',
        type: 'text',
        pattern: '(reached|hit) (your|the) (limit|quota)|limit reached',
        reason: 'Gemini usage limit reached',
      },
    ],
  },
  grok: {
    rules: [
      {
        id: 'signed-out',
        type: 'url',
        pattern: '^https://(grok\\.com/sign-in|accounts\\.x\\.ai/)',
        reason: 'Signed out of Grok; sign in again',
      },
      {
        id: 'rate-limit',
        type: 'text',
        pattern: 'rate limit|limit reached|too many requests',
        reason: 'Grok is rate limiting requests',
      },
    ],
  },
});

/**
 * @param {string} platform
 * @param {StateSnapshot} snapshot
 * @returns {BlockedVerdict}
 */
function detectBlocked(platform, snapshot) {
  const manifest = BLOCKED_MANIFESTS[platform];
  if (!manifest || !snapshot) return { blocked: false };
  const notices = (snapshot.notices || []).join('\n');
  for (const rule of manifest.rules) {
    const hit =
      rule.type === 'url'
        ? new RegExp(rule.pattern, 'i').test(snapshot.url || '')
        : rule.type === 'text'
          ? new RegExp(rule.pattern, 'i').test(notices)
          : (snapshot.selectorHits || []).includes(rule.id);
    if (hit) return { blocked: true, ruleId: rule.id, reason: rule.reason };
  }
  return { blocked: false };
}

/**
 * Script for webContents.executeJavaScript(): returns a StateSnapshot. Rule selectors are
 * embedded with JSON.stringify; manifests are bundled code, never user input.
 * @param {string} platform
 * @returns {string}
 */
function buildStateSnapshotScript(platform) {
  const selectorRules = (BLOCKED_MANIFESTS[platform]?.rules || [])
    .filter((rule) => rule.type === 'selector')
    .map((rule) => ({ id: rule.id, selector: /** @type {SelectorRule} */ (rule).selector }));
  return `(() => {
  const selectorRules = ${JSON.stringify(selectorRules)};
  const notices = Array.from(document.querySelectorAll(${JSON.stringify(NOTICE_SELECTOR)}))
    .map((el) => String(el.innerText || '').trim().slice(0, ${MAX_NOTICE_LENGTH}))
    .filter(Boolean)
    .slice(0, ${MAX_NOTICES});
  const selectorHits = selectorRules
    .filter((rule) => { try { return Boolean(document.querySelector(rule.selector)); } catch (e) { return false; } })
    .map((rule) => rule.id);
  return { url: String(location.href), notices, selectorHits };
})()`;
}

module.exports = {
  BLOCKED_MANIFESTS,
  NOTICE_SELECTOR,
  detectBlocked,
  buildStateSnapshotScript,
};
