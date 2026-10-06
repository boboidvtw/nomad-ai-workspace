/**
 * Nomad Line-by-Line & Word Diff Engine
 * Fast Longest Common Subsequence (LCS) comparison for Multi-AI perspectives.
 * Governed by AGENTS.md Section 6: Atomic Contract & Result Pattern.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

/**
 * Compute side-by-side or unified diff between two texts
 * @param {string} textA - Original text (e.g. Claude perspective)
 * @param {string} textB - Modified text (e.g. ChatGPT perspective)
 * @param {Object} [options]
 * @param {string} [options.labelA='Perspective A']
 * @param {string} [options.labelB='Perspective B']
 * @returns {import('../result').UnitResult<{ lines: Array<{ type: 'equal'|'add'|'del', value: string, lineA?: number, lineB?: number }>, stats: { added: number, deleted: number, unchanged: number, similarityRatio: number }, labelA: string, labelB: string }>}
 */
function computeDiff(textA, textB, options = {}) {
  try {
    if (typeof textA !== 'string' || typeof textB !== 'string') {
      return err(ErrorCodes.DIFF_EXECUTION_FAILED_001, 'Diff inputs must be strings');
    }

    const linesA = textA.split('\n');
    const linesB = textB.split('\n');

    // Matrix for Longest Common Subsequence (LCS)
    const m = linesA.length;
    const n = linesB.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (linesA[i - 1] === linesB[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to extract diff chunks
    let i = m;
    let j = n;
    /** @type {Array<{ type: 'equal'|'add'|'del', value: string, lineA?: number, lineB?: number }>} */
    const diff = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
        diff.unshift({ type: 'equal', value: linesA[i - 1], lineA: i, lineB: j });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diff.unshift({ type: 'add', value: linesB[j - 1], lineB: j });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        diff.unshift({ type: 'del', value: linesA[i - 1], lineA: i });
        i--;
      }
    }

    let added = 0;
    let deleted = 0;
    let unchanged = 0;

    for (const d of diff) {
      if (d.type === 'add') added++;
      else if (d.type === 'del') deleted++;
      else unchanged++;
    }

    const totalLines = Math.max(1, m + n);
    const lcsLength = dp[m][n];
    const similarityRatio = Number(((2 * lcsLength) / totalLines).toFixed(4));

    return ok({
      lines: diff,
      stats: {
        added,
        deleted,
        unchanged,
        similarityRatio
      },
      labelA: options.labelA || 'Perspective A',
      labelB: options.labelB || 'Perspective B'
    });
  } catch (e) {
    return err(
      ErrorCodes.DIFF_EXECUTION_FAILED_001,
      'Diff computation error: ' + (e instanceof Error ? e.message : String(e))
    );
  }
}

module.exports = {
  computeDiff
};
