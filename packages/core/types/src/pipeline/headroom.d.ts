/**
 * Fast LLM token heuristic estimator (CJK + Western mix)
 * Western: ~4 chars per token
 * CJK / Symbols: ~1.5 chars per token
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text: string): number;
/**
 * Compress context text by eliminating redundant fluff, whitespace, and middle dialogue turns
 * @param {string} text - Raw input prompt or accumulated history
 * @param {Object} [options]
 * @param {'light'|'balanced'|'aggressive'} [options.level='balanced']
 * @param {number} [options.maxTokens] - Target token ceiling
 * @returns {import('../result').UnitResult<{ originalTokens: number, compressedTokens: number, savedTokens: number, savingsRatio: number, text: string }>}
 */
export function compress(text: string, options?: {
    level?: "light" | "balanced" | "aggressive" | undefined;
    maxTokens?: number | undefined;
}): import("../result").UnitResult<{
    originalTokens: number;
    compressedTokens: number;
    savedTokens: number;
    savingsRatio: number;
    text: string;
}>;
