export type UrlRule = {
    id: string;
    type: "url";
    pattern: string;
    reason: string;
};
export type TextRule = {
    id: string;
    type: "text";
    pattern: string;
    reason: string;
};
export type SelectorRule = {
    id: string;
    type: "selector";
    selector: string;
    reason: string;
};
export type TailRule = {
    id: string;
    type: "tail";
    pattern: string;
    after?: string;
    reason: string;
};
export type BlockedRule = UrlRule | TextRule | SelectorRule | TailRule;
export type BlockedManifest = {
    rules: BlockedRule[];
};
export type StateSnapshot = {
    url: string;
    /**
     * - text of alert/dialog/banner/status regions
     */
    notices: string[];
    /**
     * - ids of selector rules that matched
     */
    selectorHits: string[];
    /**
     * - page text after the last prompt (or the end of the page); collected
     * only for platforms with tail rules
     */
    tail?: string | undefined;
};
export type BlockedVerdict = {
    blocked: false;
} | {
    blocked: true;
    ruleId: string;
    reason: string;
};
/** @type {Readonly<Record<string, BlockedManifest>>} */
export const BLOCKED_MANIFESTS: Readonly<Record<string, BlockedManifest>>;
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
export const NOTICE_SELECTOR: "[role=\"alert\"], [role=\"alertdialog\"], [role=\"dialog\"], [role=\"status\"], [role=\"banner\"]";
/**
 * @param {string} platform
 * @param {StateSnapshot} snapshot
 * @returns {BlockedVerdict}
 */
export function detectBlocked(platform: string, snapshot: StateSnapshot): BlockedVerdict;
/**
 * Script for webContents.executeJavaScript(): returns a StateSnapshot. Rule selectors are
 * embedded with JSON.stringify; manifests are bundled code, never user input.
 * @param {string} platform
 * @returns {string}
 */
export function buildStateSnapshotScript(platform: string): string;
