/**
 * Headroom - Context Token Compression & Budget Optimizer
 * Governed by AGENTS.md Section 6: Atomic Contract & Zero Exception Protocol
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

// Heuristic conversational fluff to strip from LLM turn inputs
const FILLER_PATTERNS = [
  /^(你好[！!，, ]*我是.*?(。|！|\n))/gim,
  /^(好的[，, ]*(這就|我來|馬上)為您(處理|解答|說明|分析)[^。！\n]*[。！\n])/gim,
  /^(當然可以[，, ]*請看以下(說明|內容|分析)[^。！\n]*[。！\n])/gim,
  /^(sure[!, ]*i'd be happy to help( with that)?[.!]?\s*)/gim,
  /^(certainly[!, ]*here is (the|an) (overview|explanation|solution)[^.\n]*[.!]?\s*)/gim,
  /^(as an ai language model[!, ]*)/gim,
  /^(hello[!, ]*how can i help you today\??\s*)/gim,
];

/**
 * Fast LLM token heuristic estimator (CJK + Western mix)
 * Western: ~4 chars per token
 * CJK / Symbols: ~1.5 chars per token
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;

  let cjkCount = 0;
  let nonCjkCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x3040 && code <= 0x30ff)
    ) {
      cjkCount++;
    } else {
      nonCjkCount++;
    }
  }

  const cjkTokens = Math.ceil(cjkCount / 1.5);
  const nonCjkTokens = Math.ceil(nonCjkCount / 4.0);
  return Math.max(1, cjkTokens + nonCjkTokens);
}

/**
 * Compress context text by eliminating redundant fluff, whitespace, and middle dialogue turns
 * @param {string} text - Raw input prompt or accumulated history
 * @param {Object} [options]
 * @param {'light'|'balanced'|'aggressive'} [options.level='balanced']
 * @param {number} [options.maxTokens] - Target token ceiling
 * @returns {import('../result').UnitResult<{ originalTokens: number, compressedTokens: number, savedTokens: number, savingsRatio: number, text: string }>}
 */
function compress(text, options = {}) {
  try {
    if (typeof text !== 'string') {
      return err(ErrorCodes.PIPELINE_INVALID_INPUT_003, 'Headroom input text must be a string');
    }

    const originalTokens = estimateTokens(text);
    if (!text.trim()) {
      return ok({
        originalTokens: 0,
        compressedTokens: 0,
        savedTokens: 0,
        savingsRatio: 0,
        text: '',
      });
    }

    const level = options.level || 'balanced';
    let result = text;

    // 1. Strip conversational filler greetings / closings (if balanced or aggressive)
    if (level === 'balanced' || level === 'aggressive') {
      for (const pattern of FILLER_PATTERNS) {
        result = result.replace(pattern, '');
      }
    }

    // 2. Normalize whitespace and empty lines
    result = result.replace(/\n{3,}/g, '\n\n');
    result = result.replace(/[ \t]+$/gm, '');

    // 3. In aggressive mode, compact markdown lists and code indentation
    if (level === 'aggressive') {
      const parts = result.split(/(```[\s\S]*?```)/g);
      for (let i = 0; i < parts.length; i++) {
        if (!parts[i].startsWith('```')) {
          parts[i] = parts[i].replace(/[ \t]{2,}/g, ' ');
        }
      }
      result = parts.join('');
    }

    // 4. Budget Headroom Check (if maxTokens is specified)
    if (options.maxTokens && options.maxTokens > 0) {
      let currentTokens = estimateTokens(result);
      if (currentTokens > options.maxTokens) {
        const lines = result.split('\n');
        if (lines.length > 10) {
          const keepHead = Math.max(3, Math.floor(lines.length * 0.35));
          const keepTail = Math.max(3, Math.floor(lines.length * 0.35));
          const headLines = lines.slice(0, keepHead);
          const tailLines = lines.slice(lines.length - keepTail);
          const omittedCount = Math.max(1, lines.length - keepHead - keepTail);

          result = [
            ...headLines,
            '',
            `> ⚡ [Headroom: 已壓縮並省略中間 ${omittedCount} 行歷史上下文，保留核心目標與最新指令]`,
            '',
            ...tailLines,
          ].join('\n');
        }
      }
    }

    result = result.trim();
    const compressedTokens = estimateTokens(result);
    const savedTokens = Math.max(0, originalTokens - compressedTokens);
    const savingsRatio = originalTokens > 0 ? Number((savedTokens / originalTokens).toFixed(4)) : 0;

    return ok({
      originalTokens,
      compressedTokens,
      savedTokens,
      savingsRatio,
      text: result,
    });
  } catch (e) {
    return err(
      ErrorCodes.PIPELINE_HEADROOM_COMPRESSION_FAILED_001,
      'Headroom compression error: ' + (e instanceof Error ? e.message : String(e)),
    );
  }
}

module.exports = {
  estimateTokens,
  compress,
};
