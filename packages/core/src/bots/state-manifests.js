/**
 * Nomad Shared Core - Blocked-state manifests (SPEC-AGENT-BOTS M3)
 * Data, not code: when a platform changes its UI, edit the rules here. The page-side script
 * only collects a snapshot (URL, alert/dialog text, which selectors match); the decision is
 * made in Node by detectBlocked(), so rules stay testable without a browser.
 *
 * Text rules only look at alert, dialog, banner and status regions, never at message bodies,
 * so an AI reply that merely mentions "rate limit" does not count as blocked. Tail rules are for
 * notices a platform draws inside the conversation instead (Grok's capacity notice): they read
 * only what follows the last prompt (`after`), where that notice replaces the reply, so a notice
 * that a later prompt got past no longer counts. Without `after`, or before any prompt, they read
 * the last few hundred characters of the page. Their patterns quote the notice itself rather
 * than words a reply could use.
 */

/**
 * @typedef {{ id: string, type: 'url', pattern: string, reason: string }} UrlRule
 * @typedef {{ id: string, type: 'text', pattern: string, reason: string }} TextRule
 * @typedef {{ id: string, type: 'selector', selector: string, reason: string }} SelectorRule
 * @typedef {{ id: string, type: 'tail', pattern: string, after?: string, reason: string }} TailRule
 * @typedef {UrlRule | TextRule | SelectorRule | TailRule} BlockedRule
 * @typedef {{ rules: BlockedRule[] }} BlockedManifest
 *
 * @typedef {Object} StateSnapshot
 * @property {string} url
 * @property {string[]} notices - text of alert/dialog/banner/status regions
 * @property {string[]} selectorHits - ids of selector rules that matched
 * @property {string} [tail] - page text after the last prompt (or the end of the page); collected
 *   only for platforms with tail rules
 *
 * @typedef {{ blocked: false } | { blocked: true, ruleId: string, reason: string }} BlockedVerdict
 */

/** Regions whose text can signal a blocked state. */
const NOTICE_SELECTOR =
  '[role="alert"], [role="alertdialog"], [role="dialog"], [role="status"], [role="banner"]';
const MAX_NOTICE_LENGTH = 500;
const MAX_NOTICES = 20;
/** The notice, the composer's chrome after it, and some slack. */
const TAIL_LENGTH = 600;

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
      {
        // Two zh-TW wordings seen on 2026-11-02: 需求量高 / Grok 目前使用人數較多，請稍後再試… /
        // 升級至 Super, and 需求量高 / 請稍後再試，或升級以取得更高的優先使用權 / 升級. Add the
        // English notice once its exact wording is seen; a guess could match a reply.
        id: 'high-demand',
        type: 'tail',
        after: '[data-testid="user-message"]',
        pattern:
          '需求量高[\\s\\S]{0,40}(目前使用人數較多|請稍後再試，或升級)|使用人數較多，請稍後再試',
        reason: 'Grok is at capacity; try again later',
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
          : rule.type === 'tail'
            ? new RegExp(rule.pattern, 'i').test(snapshot.tail || '')
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
  const rules = BLOCKED_MANIFESTS[platform]?.rules || [];
  const tailRules = /** @type {TailRule[]} */ (rules.filter((rule) => rule.type === 'tail'));
  const readsTail = tailRules.length > 0;
  const tailAfter = tailRules.find((rule) => rule.after)?.after || null;
  const selectorRules = rules
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
  const snapshot = { url: String(location.href), notices, selectorHits };
  if (${readsTail}) {
    const tailAfter = ${JSON.stringify(tailAfter)};
    // innerText, not textContent: script data in the page must never match a notice.
    const text = String((document.body && (document.body.innerText || document.body.textContent)) || '');
    const prompts = tailAfter ? document.querySelectorAll(tailAfter) : [];
    const lastPrompt = prompts[prompts.length - 1];
    const promptText = lastPrompt ? String(lastPrompt.innerText || lastPrompt.textContent || '').trim() : '';
    const at = promptText ? text.lastIndexOf(promptText) : -1;
    snapshot.tail = at >= 0
      ? text.slice(at + promptText.length, at + promptText.length + ${TAIL_LENGTH})
      : text.slice(-${TAIL_LENGTH});
  }
  return snapshot;
})()`;
}

module.exports = {
  BLOCKED_MANIFESTS,
  NOTICE_SELECTOR,
  detectBlocked,
  buildStateSnapshotScript,
};
