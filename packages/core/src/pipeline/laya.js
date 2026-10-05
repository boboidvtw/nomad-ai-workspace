/**
 * Laya - Forward Millisecond Intent Decision Engine & Prompt Intelligence Enhancer
 * Governed by AGENTS.md Section 6: Atomic Contract & Zero Exception Protocol
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

const INTENT_RULES = [
  {
    intent: 'debug',
    keywords: ['debug', 'bug', '報錯', '失敗', '例外', '異常', 'fix', 'error', 'traceback', 'crash', '修復', '修正', '壞掉'],
    platform: 'claude',
    confidence: 0.95,
    tag: '除錯修復',
    directive: '遵循原子合約規範，不更動公開介面合約，精準定位根因並提供可重現之驗證測試。'
  },
  {
    intent: 'refactor',
    keywords: ['refactor', '重構', '優化', '效能', '加速', '調優', 'perf', '壞味道', '收斂', 'dry', 'solid', '複雜度'],
    platform: 'claude',
    confidence: 0.92,
    tag: '效能重構',
    directive: '消除程式碼壞味道與冗餘依賴，進行複雜度收斂與記憶體保護，保持向後相容。'
  },
  {
    intent: 'architecture',
    keywords: ['architecture', '架構', '設計', '選型', '規範', '拓撲', 'blueprint', 'ddl', 'schema', '分層', '微服務'],
    platform: 'claude',
    confidence: 0.90,
    tag: '系統架構',
    directive: '採用模組化與依賴注入設計，運用結構化表格對比與 Mermaid 架構圖釐清資料流向。'
  },
  {
    intent: 'code',
    keywords: ['function', 'class', '實作', '編寫', '寫一個', '新增', '能力', '模組', '元件', 'api', 'controller', 'service'],
    platform: 'claude',
    confidence: 0.88,
    tag: '程式開發',
    directive: '遵循零異常拋出與 Result Pattern，補齊完整型別註解與邊界條件處理。'
  },
  {
    intent: 'analysis',
    keywords: ['調研', '審計', '比較', '文獻', 'audit', '評估', '查閱', '生態', '最新', '搜尋', '現狀'],
    platform: 'perplexity',
    confidence: 0.85,
    tag: '深度調研',
    directive: '搜尋先行確認 Prior Art，對比多方標竿生態方案與已知限制，提供條理化結論。'
  },
  {
    intent: 'creative',
    keywords: ['撰寫', '構思', '文案', '起草', '文章', '創意', 'brainstorm', '行銷'],
    platform: 'chatgpt',
    confidence: 0.80,
    tag: '創意文案',
    directive: '結構清晰、語氣生動，兼具專業度與易讀性。'
  }
];

const TECH_TAG_PATTERNS = [
  { tag: 'TypeScript', regex: /\b(ts|typescript)\b/i },
  { tag: 'Node.js', regex: /\b(node|nodejs|npm|bun)\b/i },
  { tag: 'Electron', regex: /\b(electron|main\.js|preload|ipcRenderer)\b/i },
  { tag: 'React', regex: /\b(react|hooks|component|jsx|tsx)\b/i },
  { tag: 'Python', regex: /\b(python|py|django|fastapi)\b/i },
  { tag: 'Docker', regex: /\b(docker|orbstack|compose)\b/i },
  { tag: 'Database', regex: /\b(sql|postgres|redis|mongo|prisma)\b/i }
];

/**
 * Fast millisecond intent decision & prompt enhancement
 * @param {string} prompt - Raw prompt string
 * @param {Object} [options]
 * @param {boolean} [options.enhance=false] - Whether to inject smart guidance directives
 * @param {string} [options.preferredPlatform] - User override platform preference
 * @returns {import('../result').UnitResult<{ intent: string, confidence: number, recommendedPlatform: string, tags: string[], originalPrompt: string, enhancedPrompt: string, enhanced: boolean, latencyMs: number }>}
 */
function decide(prompt, options = {}) {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    if (typeof prompt !== 'string') {
      return err(ErrorCodes.PIPELINE_INVALID_INPUT_003, 'Laya prompt must be a string');
    }

    const lower = prompt.toLowerCase();
    let matchedRule = null;

    // Sub-millisecond rule check
    for (const rule of INTENT_RULES) {
      if (rule.keywords.some(k => lower.includes(k))) {
        matchedRule = rule;
        break;
      }
    }

    const intent = matchedRule ? matchedRule.intent : 'general';
    const confidence = matchedRule ? matchedRule.confidence : 0.65;
    const recommendedPlatform = options.preferredPlatform || (matchedRule ? matchedRule.platform : 'chatgpt');

    // Extract tags
    const tags = [];
    if (matchedRule?.tag) tags.push(matchedRule.tag);
    for (const item of TECH_TAG_PATTERNS) {
      if (item.regex.test(prompt)) {
        tags.push(item.tag);
      }
    }

    // Enhance prompt if requested
    let enhancedPrompt = prompt;
    let enhanced = false;

    if (options.enhance && matchedRule?.directive) {
      enhanced = true;
      enhancedPrompt = `${prompt}\n\n> 🧭 [Laya 前向決策引導 (${matchedRule.tag} - 建議引擎: ${recommendedPlatform})]: ${matchedRule.directive}`;
    }

    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const latencyMs = Number((endTime - startTime).toFixed(3));

    return ok({
      intent,
      confidence,
      recommendedPlatform,
      tags,
      originalPrompt: prompt,
      enhancedPrompt,
      enhanced,
      latencyMs
    });
  } catch (e) {
    return err(
      ErrorCodes.PIPELINE_LAYA_DECISION_FAILED_002,
      'Laya decision error: ' + (e instanceof Error ? e.message : String(e))
    );
  }
}

module.exports = {
  decide
};
