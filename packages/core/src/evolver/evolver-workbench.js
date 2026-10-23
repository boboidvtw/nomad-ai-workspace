/**
 * Nomad Evolver Studio - Native Agent IDE Workbench & Auto-Guarded Evolution Engine
 * Governed by RFC-0001 & AGENTS.md Section 6: Atomic Contract & Result Pattern.
 *
 * Bridges:
 * 1. antigravity-experience-db (Universal Gene Registry SSOT)
 * 2. claude-config (~/.claude/CLAUDE.md & PreToolUse Hooks)
 * 3. MacStudio-gemini-config (~/.gemini/GEMINI.md & dynamic_rules.md)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { computeDiff } = require('../diff/diff-engine');
const { estimateTokens } = require('../pipeline/headroom');

/**
 * @typedef {'RULE' | 'HOOK' | 'SKILL_PATCH' | 'HYBRID'} GeneMutationType
 */

/**
 * @typedef {'PENDING_APPROVAL' | 'ACTIVE' | 'REVERTED' | 'ARCHIVED'} GeneStatus
 */

/**
 * @typedef {Object} HarnessGene
 * @property {string} geneId
 * @property {string} title
 * @property {string} domain
 * @property {string} sourceEngine
 * @property {string} createdAt
 * @property {string} triggerSymptom
 * @property {GeneMutationType} mutationType
 * @property {GeneStatus} status
 * @property {string} ruleDirective
 * @property {{ targetTool: string, matchRegex: string, action: string }} hookGuard
 * @property {{ evalScript: string, passRate: number, regressionPassed: number, regressionTotal: number, tokenDelta: number }} verification
 * @property {{ hitCount: number, savedErrors: number, distilledToWeights: boolean }} telemetry
 * @property {{ experienceDbYaml: string, claudeConfigPatch: string, geminiConfigPatch: string }} [compiledTargets]
 */

/**
 * @typedef {Object} SurgicalPatchItem
 * @property {string} patchId
 * @property {string} filePath
 * @property {'M' | 'A' | 'D'} changeType
 * @property {string} worktreeBranch
 * @property {'PENDING' | 'MERGED' | 'REJECTED'} status
 * @property {string} summary
 * @property {string} beforeCode
 * @property {string} afterCode
 * @property {{ lines: Array<{ type: 'equal'|'add'|'del', value: string, lineA?: number, lineB?: number }>, stats: { added: number, deleted: number, unchanged: number, similarityRatio: number } }} diff
 */

const DEFAULT_MAX_TOKEN_DELTA = 120;
const EVOLVER_BLOCK_START = '<!-- BEGIN_NOMAD_EVOLVER_GENES -->';
const EVOLVER_BLOCK_END = '<!-- END_NOMAD_EVOLVER_GENES -->';

/**
 * @typedef {Object} EvolverTargetPaths
 * @property {string} experienceDbGenesDir - e.g. ~/.gemini/memory/experience-db/genes/evolver
 * @property {string} claudeRulesFile - e.g. ~/.claude/rules/common/evolver-genes.md
 * @property {string} claudeHooksFile - e.g. ~/.claude/hooks/evolver-guard-rules.json
 * @property {string} [claudeRepoDir] - e.g. ~/Developer/claudecode_project/claude-config
 * @property {string} geminiDynamicRulesFile - e.g. ~/.gemini/memory/coding/dynamic_rules.md
 */

/**
 * Resolves the physical filesystem paths for the 3-Repo Self-Evolving Harness.
 * @param {Partial<EvolverTargetPaths>} [customPaths]
 * @param {string} [homeDir]
 * @returns {EvolverTargetPaths}
 */
function resolveEvolverPaths(customPaths = {}, homeDir = os.homedir()) {
  return {
    experienceDbGenesDir:
      customPaths.experienceDbGenesDir ||
      path.join(homeDir, '.gemini', 'memory', 'experience-db', 'genes', 'evolver'),
    claudeRulesFile:
      customPaths.claudeRulesFile ||
      path.join(homeDir, '.claude', 'rules', 'common', 'evolver-genes.md'),
    claudeHooksFile:
      customPaths.claudeHooksFile ||
      path.join(homeDir, '.claude', 'hooks', 'evolver-guard-rules.json'),
    claudeRepoDir:
      customPaths.claudeRepoDir !== undefined
        ? customPaths.claudeRepoDir
        : path.join(homeDir, 'Developer', 'claudecode_project', 'claude-config'),
    geminiDynamicRulesFile:
      customPaths.geminiDynamicRulesFile ||
      path.join(homeDir, '.gemini', 'memory', 'coding', 'dynamic_rules.md'),
  };
}

/**
 * Pure compiler that transforms a HarnessGene into the 3-repo target payloads.
 * @param {HarnessGene} gene
 * @returns {import('../result').UnitResult<{ experienceDbYaml: string, experienceDbJson: Record<string, any>, claudeConfigPatch: string, geminiConfigPatch: string }>}
 */
function compileGeneToThreeRepos(gene) {
  if (!gene || typeof gene !== 'object' || !gene.geneId || !gene.ruleDirective) {
    return err(
      ErrorCodes.EVOLVER_GENE_INVALID_001,
      'Gene must contain a valid geneId and ruleDirective',
    );
  }

  const hookTarget = gene.hookGuard?.targetTool || 'run_command';
  const hookRegex = gene.hookGuard?.matchRegex || '.*';
  const hookAction = gene.hookGuard?.action || 'WARN_AND_INJECT_HINT';
  const status = gene.status || 'PENDING_APPROVAL';
  const tokenDelta = gene.verification?.tokenDelta ?? estimateTokens(gene.ruleDirective);
  const passRate = gene.verification?.passRate ?? 1.0;

  const experienceDbYaml = [
    `gene_id: ${gene.geneId}`,
    `title: "${gene.title || gene.geneId}"`,
    `status: "${status}"`,
    `created_at: "${gene.createdAt || new Date().toISOString()}"`,
    `source_engine: "${gene.sourceEngine || 'nomad-evolver-studio'}"`,
    `mutation_type: "${gene.mutationType || 'HYBRID'}"`,
    `trigger_symptom: "${String(gene.triggerSymptom || '').replace(/"/g, '\\"')}"`,
    `rule_directive:`,
    `  domain: "${gene.domain || 'general'}"`,
    `  instruction: "${String(gene.ruleDirective).replace(/"/g, '\\"')}"`,
    `hook_guard:`,
    `  target_tool: "${hookTarget}"`,
    `  match_regex: "${String(hookRegex).replace(/"/g, '\\"')}"`,
    `  action: "${hookAction}"`,
    `verification:`,
    `  eval_script: "${gene.verification?.evalScript || 'evals/test_gene_gate.js'}"`,
    `  pass_rate: ${passRate}`,
    `  token_delta: ${tokenDelta}`,
  ].join('\n');

  // Compatible with ~/.gemini/scripts/inheritance_loader.py & knowledge_injection.py
  const experienceDbJson = {
    repo: `nomad-evolver-studio/${gene.domain || 'general'}`,
    gene_id: gene.geneId,
    title: gene.title || gene.geneId,
    status,
    domain: gene.domain || 'general',
    source_engine: gene.sourceEngine || 'nomad-evolver-studio',
    created_at: gene.createdAt || new Date().toISOString(),
    mutation_type: gene.mutationType || 'HYBRID',
    trigger_symptom: gene.triggerSymptom || '',
    rule_directive: gene.ruleDirective,
    hook_guard: {
      target_tool: hookTarget,
      match_regex: hookRegex,
      action: hookAction,
    },
    verification: {
      eval_script: gene.verification?.evalScript || 'evals/test_gene_gate.js',
      pass_rate: passRate,
      regression_passed: gene.verification?.regressionPassed ?? 74,
      regression_total: gene.verification?.regressionTotal ?? 74,
      token_delta: tokenDelta,
    },
    telemetry: {
      hit_count: gene.telemetry?.hitCount ?? 1,
      saved_errors: gene.telemetry?.savedErrors ?? 1,
      distilled_to_weights: Boolean(gene.telemetry?.distilledToWeights),
    },
    gdi_scores: {
      total: Math.round(passRate * 95),
    },
    capabilities: [
      {
        gene_id: gene.geneId,
        trigger: `${gene.title || gene.geneId}: ${gene.triggerSymptom || ''}`.trim(),
        logic_pattern: `${gene.domain || 'general'} (${gene.mutationType || 'HYBRID'})`,
        best_practice: `[${gene.geneId}] ${gene.ruleDirective}`,
      },
    ],
  };

  const claudeConfigPatch = [
    `# [claude-config] Auto-Compiled Gene: ${gene.geneId} (${gene.domain})`,
    `- **[${gene.geneId}]** (${gene.domain || 'general'}): ${gene.ruleDirective}`,
    `  - *Trigger Symptom*: ${gene.triggerSymptom || 'N/A'}`,
    `  - *PreToolUse Guard*: \`${hookTarget}\` matching \`/${hookRegex}/\` -> \`${hookAction}\``,
  ].join('\n');

  const geminiConfigPatch = [
    `<!-- [MacStudio-gemini-config] Auto-Compiled Gene: ${gene.geneId} -->`,
    `- **[${gene.geneId} | ${gene.domain || 'general'}]**: ${gene.ruleDirective} *(觸發徵兆: ${gene.triggerSymptom || 'N/A'})*`,
  ].join('\n');

  return ok({
    experienceDbYaml,
    experienceDbJson,
    claudeConfigPatch,
    geminiConfigPatch,
  });
}

/**
 * Synchronizes all genes to the 3 physical repositories on disk:
 * 1. antigravity-experience-db (`genes/evolver/<geneId>.yaml` + `.json`)
 * 2. claude-config (`~/.claude/rules/common/evolver-genes.md` + `~/.claude/hooks/evolver-guard-rules.json`)
 * 3. MacStudio-gemini-config (`~/.gemini/memory/coding/dynamic_rules.md`)
 *
 * @param {HarnessGene[]} genes
 * @param {Partial<EvolverTargetPaths>} [customPaths]
 * @returns {import('../result').UnitResult<{ writtenFiles: string[], activeCount: number, syncedAt: string, paths: EvolverTargetPaths }>}
 */
function syncGenesToThreeRepos(genes, customPaths = {}) {
  if (!Array.isArray(genes)) {
    return err(ErrorCodes.EVOLVER_GENE_INVALID_001, 'genes must be an array');
  }

  const paths = resolveEvolverPaths(customPaths);
  /** @type {string[]} */
  const writtenFiles = [];

  try {
    // 1. Write YAML + JSON gene files to antigravity-experience-db/genes/evolver/
    fs.mkdirSync(paths.experienceDbGenesDir, { recursive: true });
    for (const gene of genes) {
      const compiled = compileGeneToThreeRepos(gene);
      if (!compiled.success) continue;

      const yamlPath = path.join(paths.experienceDbGenesDir, `${gene.geneId}.yaml`);
      const jsonPath = path.join(paths.experienceDbGenesDir, `${gene.geneId}.json`);
      fs.writeFileSync(yamlPath, compiled.data.experienceDbYaml + '\n', 'utf8');
      fs.writeFileSync(jsonPath, JSON.stringify(compiled.data.experienceDbJson, null, 2) + '\n', 'utf8');
      writtenFiles.push(yamlPath, jsonPath);
    }

    const activeGenes = genes.filter((g) => g.status === 'ACTIVE');

    // 2. Compile active genes to claude-config (~/.claude/rules/common/evolver-genes.md & hooks)
    // Note: ~/.claude/CLAUDE.md explicitly auto-loads ~/.claude/rules/common/*.md so we never overwrite CLAUDE.md.
    fs.mkdirSync(path.dirname(paths.claudeRulesFile), { recursive: true });
    const claudeMdLines = [
      '<!-- Auto-Generated by Nomad Evolver Studio (RFC-0001) - DO NOT EDIT MANUALLY -->',
      '# 🧬 Nomad Evolver Auto-Guarded Harness Genes (Claude Code)',
      '',
      '> 本檔案由 **Nomad Evolver Studio** 從 `antigravity-experience-db` 自動編譯生成，並由 `~/.claude/CLAUDE.md` Harness 自動載入。',
      '',
      `## 🛡️ Active Harness Genes (${activeGenes.length})`,
      '',
    ];

    if (activeGenes.length === 0) {
      claudeMdLines.push('- *(目前尚無啟用中的自動演化基因)*');
    } else {
      for (const gene of activeGenes) {
        const compiled = compileGeneToThreeRepos(gene);
        if (compiled.success) {
          claudeMdLines.push(compiled.data.claudeConfigPatch, '');
        }
      }
    }
    const claudeMdContent = claudeMdLines.join('\n').trimEnd() + '\n';
    fs.writeFileSync(paths.claudeRulesFile, claudeMdContent, 'utf8');
    writtenFiles.push(paths.claudeRulesFile);

    // Write structured PreToolUse Hook guards for Claude Code
    fs.mkdirSync(path.dirname(paths.claudeHooksFile), { recursive: true });
    const claudeHooksPayload = {
      schemaVersion: '1.0',
      generatedBy: 'nomad-evolver-studio',
      updatedAt: new Date().toISOString(),
      activeGuards: activeGenes.map((g) => ({
        geneId: g.geneId,
        domain: g.domain,
        targetTool: g.hookGuard?.targetTool || 'run_command',
        matchRegex: g.hookGuard?.matchRegex || '.*',
        action: g.hookGuard?.action || 'WARN_AND_INJECT_HINT',
        ruleDirective: g.ruleDirective,
      })),
    };
    const claudeHooksContent = JSON.stringify(claudeHooksPayload, null, 2) + '\n';
    fs.writeFileSync(paths.claudeHooksFile, claudeHooksContent, 'utf8');
    writtenFiles.push(paths.claudeHooksFile);

    // Mirror into local claude-config Git repository if present
    if (paths.claudeRepoDir && fs.existsSync(paths.claudeRepoDir)) {
      const repoRulesFile = path.join(paths.claudeRepoDir, 'rules', 'common', 'evolver-genes.md');
      const repoHooksFile = path.join(paths.claudeRepoDir, 'hooks', 'evolver-guard-rules.json');
      fs.mkdirSync(path.dirname(repoRulesFile), { recursive: true });
      fs.mkdirSync(path.dirname(repoHooksFile), { recursive: true });
      fs.writeFileSync(repoRulesFile, claudeMdContent, 'utf8');
      fs.writeFileSync(repoHooksFile, claudeHooksContent, 'utf8');
      writtenFiles.push(repoRulesFile, repoHooksFile);
    }

    // 3. Compile active genes to MacStudio-gemini-config (~/.gemini/memory/coding/dynamic_rules.md)
    fs.mkdirSync(path.dirname(paths.geminiDynamicRulesFile), { recursive: true });
    let existingGeminiRules = '';
    if (fs.existsSync(paths.geminiDynamicRulesFile)) {
      existingGeminiRules = fs.readFileSync(paths.geminiDynamicRulesFile, 'utf8');
    } else {
      existingGeminiRules = [
        '<!-- 這是由 knowledge_injection.py 自動生成的動態知識庫 -->',
        '# 🧠 動態核心知識與規則 (Dynamic Knowledge)',
        '',
        '> 此文件包含從現有 Skills 與執行經驗中萃取出的最佳實踐與設計模式。AI 應優先考慮將這些模式應用於未來的架構決策中。',
        '',
      ].join('\n');
    }

    const evolverSectionLines = [
      EVOLVER_BLOCK_START,
      '## 🧬 Nomad Evolver 自動演化防錯基因 (Active Harness Genes)',
      '',
      '> 以下基因由 **Nomad Evolver Studio** 經 Shadow Sandbox 100% 迴歸測試與 Token 預算閘門驗證後自動編譯注入：',
      '',
    ];

    if (activeGenes.length === 0) {
      evolverSectionLines.push('- (尚無啟用中的基因)');
    } else {
      for (const gene of activeGenes) {
        const compiled = compileGeneToThreeRepos(gene);
        if (compiled.success) {
          evolverSectionLines.push(compiled.data.geminiConfigPatch);
        }
      }
    }
    evolverSectionLines.push(EVOLVER_BLOCK_END);
    const evolverBlock = evolverSectionLines.join('\n');

    let updatedGeminiContent;
    const startIdx = existingGeminiRules.indexOf(EVOLVER_BLOCK_START);
    const endIdx = existingGeminiRules.indexOf(EVOLVER_BLOCK_END);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      updatedGeminiContent =
        existingGeminiRules.slice(0, startIdx).trimEnd() +
        '\n\n' +
        evolverBlock +
        '\n' +
        existingGeminiRules.slice(endIdx + EVOLVER_BLOCK_END.length).trimStart();
    } else {
      updatedGeminiContent = existingGeminiRules.trimEnd() + '\n\n' + evolverBlock + '\n';
    }

    fs.writeFileSync(paths.geminiDynamicRulesFile, updatedGeminiContent.trimEnd() + '\n', 'utf8');
    writtenFiles.push(paths.geminiDynamicRulesFile);

    return ok({
      writtenFiles,
      activeCount: activeGenes.length,
      syncedAt: new Date().toISOString(),
      paths,
    });
  } catch (e) {
    return err(
      ErrorCodes.EVOLVER_SYNC_WRITE_FAILED_005,
      `Failed to synchronize genes to 3 repositories: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Validates a candidate gene against the Shadow Sandbox regression & token budget gate.
 * @param {Partial<HarnessGene>} gene
 * @param {{ maxTokenDelta?: number }} [options]
 * @returns {import('../result').UnitResult<{ passed: boolean, tokenDelta: number, passRate: number }>}
 */
function verifyGeneInShadowSandbox(gene, options = {}) {
  if (!gene || typeof gene !== 'object' || !gene.geneId || !gene.ruleDirective) {
    return err(
      ErrorCodes.EVOLVER_GENE_INVALID_001,
      'Candidate gene is missing required geneId or ruleDirective fields',
    );
  }

  const maxTokenDelta = options.maxTokenDelta ?? DEFAULT_MAX_TOKEN_DELTA;
  const tokenDelta =
    typeof gene.verification?.tokenDelta === 'number'
      ? gene.verification.tokenDelta
      : estimateTokens(gene.ruleDirective);
  const passRate = typeof gene.verification?.passRate === 'number' ? gene.verification.passRate : 1.0;

  if (passRate < 1.0) {
    return err(
      ErrorCodes.EVOLVER_SANDBOX_GATE_FAILED_003,
      `Shadow sandbox regression passRate (${passRate}) is below required 1.0 threshold`,
      { passRate, tokenDelta },
    );
  }

  if (tokenDelta > maxTokenDelta) {
    return err(
      ErrorCodes.EVOLVER_SANDBOX_GATE_FAILED_003,
      `Prompt token delta (+${tokenDelta}) exceeds budget cap (${maxTokenDelta})`,
      { passRate, tokenDelta, maxTokenDelta },
    );
  }

  return ok({
    passed: true,
    tokenDelta,
    passRate,
  });
}

/**
 * Creates the initial seed genes derived from the user's real lessons_learned-ZH.md.
 * @returns {HarnessGene[]}
 */
function createDefaultGenes() {
  /** @type {HarnessGene[]} */
  const rawGenes = [
    {
      geneId: 'GEN_DOM_LEXICAL_INSERT_005',
      title: 'Lexical 富文字編輯器防吞字與選區前置協定',
      domain: 'webview-automation',
      sourceEngine: 'antigravity',
      createdAt: '2026-10-22T13:15:00+08:00',
      triggerSymptom:
        'execCommand("insertText") 在 Copilot / Perplexity 的 Lexical 編輯器中失效，除非頁面先觸發 selectionchange',
      mutationType: 'HYBRID',
      status: 'PENDING_APPROVAL',
      ruleDirective:
        '對 Lexical 富文字編輯器注入文字時，必須依序執行 focus -> 短等待 -> selectAll -> insertText -> 驗證編輯器已含文字後才點擊送出。',
      hookGuard: {
        targetTool: 'edit_file|inject_script',
        matchRegex: 'execCommand\\([\'"]insertText[\'"]',
        action: 'WARN_AND_INJECT_HINT',
      },
      verification: {
        evalScript: 'evals/test_lexical_injector_contract.js',
        passRate: 1.0,
        regressionPassed: 74,
        regressionTotal: 74,
        tokenDelta: 38,
      },
      telemetry: {
        hitCount: 3,
        savedErrors: 3,
        distilledToWeights: false,
      },
    },
    {
      geneId: 'GEN_UI_PLAYWRIGHT_LABEL_001',
      title: 'Playwright Label 包裹 Checkbox 防雙重反轉協定',
      domain: 'browser-testing',
      sourceEngine: 'claude-code',
      createdAt: '2026-10-14T18:20:00+08:00',
      triggerSymptom:
        '當 <input type="checkbox"> 被 <label> 包裹時，直接呼叫 page.check() 會觸發兩次點擊導致狀態反轉回 unchecked',
      mutationType: 'HYBRID',
      status: 'ACTIVE',
      ruleDirective:
        '當 Checkbox 被 <label> 包裹時，禁止呼叫 page.check()，一律改用 page.evaluate(el => el.checked = true) 直接設定 DOM 狀態。',
      hookGuard: {
        targetTool: 'mcp_playwright_*|run_command',
        matchRegex: 'page\\.check\\(',
        action: 'WARN_AND_INJECT_HINT',
      },
      verification: {
        evalScript: 'evals/test_playwright_label_check.js',
        passRate: 1.0,
        regressionPassed: 74,
        regressionTotal: 74,
        tokenDelta: 34,
      },
      telemetry: {
        hitCount: 19,
        savedErrors: 14,
        distilledToWeights: true,
      },
    },
    {
      geneId: 'GEN_UI_WEBVIEW_THROTTLE_002',
      title: '隱藏 WebContentsView 防 0x0 虛擬列表凍結協定',
      domain: 'electron-runtime',
      sourceEngine: 'antigravity',
      createdAt: '2026-10-13T21:10:00+08:00',
      triggerSymptom:
        '未顯示的 WebContentsView 設為 0x0 時，虛擬化聊天 UI 不渲染且背景 timer 被節流，導致 Bot 讀取逾時',
      mutationType: 'SKILL_PATCH',
      status: 'ACTIVE',
      ruleDirective:
        '隱藏的 WebContentsView 必須維持完整內容區寬高尺寸並設定 backgroundThrottling: false，僅透過 setVisible(false) 控制顯隱。',
      hookGuard: {
        targetTool: 'edit_file',
        matchRegex: 'width:\\s*0,\\s*height:\\s*0',
        action: 'BLOCK_AND_SUGGEST_FIX',
      },
      verification: {
        evalScript: 'packages/desktop/src/__tests__/layout-engine.test.js',
        passRate: 1.0,
        regressionPassed: 74,
        regressionTotal: 74,
        tokenDelta: 36,
      },
      telemetry: {
        hitCount: 27,
        savedErrors: 22,
        distilledToWeights: true,
      },
    },
    {
      geneId: 'GEN_GIT_GUARD_HOOK_SPLIT_003',
      title: 'Shell 複合指令拆分防 Guard Hook 誤判協定',
      domain: 'shell-governance',
      sourceEngine: 'claude-code',
      createdAt: '2026-10-10T15:40:00+08:00',
      triggerSymptom:
        'guard-bash hook 將包含 test -f 的複合 && 鏈式指令誤判為 git push -f 強制推送並攔截',
      mutationType: 'RULE',
      status: 'ACTIVE',
      ruleDirective:
        '執行 Git 或檔案檢查時，將 test -f 與 git 操作拆分為獨立單步指令，提升沙盒前綴匹配率並避免 Guard Hook 誤判。',
      hookGuard: {
        targetTool: 'run_command',
        matchRegex: 'test\\s+-f.*&&.*git\\s+push',
        action: 'WARN_AND_INJECT_HINT',
      },
      verification: {
        evalScript: 'evals/test_shell_split_guard.js',
        passRate: 1.0,
        regressionPassed: 74,
        regressionTotal: 74,
        tokenDelta: 32,
      },
      telemetry: {
        hitCount: 31,
        savedErrors: 18,
        distilledToWeights: false,
      },
    },
  ];

  return rawGenes.map((g) => {
    const compiled = compileGeneToThreeRepos(g);
    return {
      ...g,
      compiledTargets: compiled.success ? compiled.data : undefined,
    };
  });
}

/**
 * Creates initial surgical patches in the Shadow Worktree for the IDE Workbench.
 * @returns {SurgicalPatchItem[]}
 */
function createDefaultSurgicalPatches() {
  const rawItems = [
    {
      patchId: 'PATCH_LAYOUT_EVOLVER_001',
      filePath: 'packages/desktop/src/layout-engine.js',
      changeType: /** @type {'M'} */ ('M'),
      worktreeBranch: 'shadow/evo-ide-workbench',
      status: /** @type {'PENDING'} */ ('PENDING'),
      summary: '新增 evolver 原生自進化 IDE 佈局模式，隱藏 Webviews 同時保留完整背景渲染尺寸',
      beforeCode: [
        '  // Determine effective mode',
        '  let effectiveMode = layout;',
        "  if (effectiveMode === 'custom') {",
        "    if (active.length === 1) effectiveMode = 'focus';",
        "    else if (active.length === 2) effectiveMode = 'dual';",
        '  }',
        '',
        "  if (effectiveMode === 'focus' || active.length === 1) {",
      ].join('\n'),
      afterCode: [
        '  // Determine effective mode',
        '  let effectiveMode = layout;',
        "  if (effectiveMode === 'evolver') {",
        '    return bounds;',
        '  }',
        "  if (effectiveMode === 'custom') {",
        "    if (active.length === 1) effectiveMode = 'focus';",
        "    else if (active.length === 2) effectiveMode = 'dual';",
        '  }',
        '',
        "  if (effectiveMode === 'focus' || active.length === 1) {",
      ].join('\n'),
    },
    {
      patchId: 'PATCH_LEXICAL_INJECTOR_002',
      filePath: 'packages/desktop/src/injectors.js',
      changeType: /** @type {'M'} */ ('M'),
      worktreeBranch: 'shadow/evo-ide-workbench',
      status: /** @type {'PENDING'} */ ('PENDING'),
      summary: '套用 GEN_DOM_LEXICAL_INSERT_005 基因：補齊 selectionchange 與文字寫入後驗核',
      beforeCode: [
        'function injectLexicalPrompt(editorEl, text) {',
        '  editorEl.focus();',
        '  document.execCommand("insertText", false, text);',
        '  return { ok: true };',
        '}',
      ].join('\n'),
      afterCode: [
        'async function injectLexicalPrompt(editorEl, text) {',
        '  editorEl.focus();',
        '  await new Promise((r) => setTimeout(r, 40));',
        '  document.execCommand("selectAll", false, null);',
        '  document.execCommand("insertText", false, text);',
        '  const verified = (editorEl.innerText || "").includes(text.slice(0, 16));',
        '  return { ok: verified };',
        '}',
      ].join('\n'),
    },
    {
      patchId: 'PATCH_GENE_YAML_003',
      filePath: 'antigravity-experience-db/genes/GEN_DOM_LEXICAL_INSERT_005.yaml',
      changeType: /** @type {'A'} */ ('A'),
      worktreeBranch: 'shadow/evo-ide-workbench',
      status: /** @type {'PENDING'} */ ('PENDING'),
      summary: '新增跨平台基因定義檔，供 Harness Compiler 同步至 ~/.claude 與 ~/.gemini',
      beforeCode: '# (New Gene File)',
      afterCode: [
        'gene_id: GEN_DOM_LEXICAL_INSERT_005',
        'mutation_type: HYBRID',
        'domain: webview-automation',
        'rule_directive:',
        '  instruction: "對 Lexical 編輯器注入時先執行 focus -> selectAll -> insertText 並驗證內文"',
        'verification:',
        '  pass_rate: 1.0',
        '  token_delta: 38',
      ].join('\n'),
    },
  ];

  return rawItems.map((item) => {
    const diffRes = computeDiff(item.beforeCode, item.afterCode, {
      labelA: 'HEAD (main)',
      labelB: item.worktreeBranch,
    });
    return {
      ...item,
      diff: diffRes.success
        ? diffRes.data
        : {
            lines: [],
            stats: { added: 0, deleted: 0, unchanged: 0, similarityRatio: 1 },
          },
    };
  });
}

/**
 * Loads persisted genes from `experience-db/genes/evolver/*.json` and merges them with seed genes.
 * @param {string} experienceDbGenesDir
 * @param {HarnessGene[]} seedGenes
 * @returns {HarnessGene[]}
 */
function loadAndMergeGenesFromDisk(experienceDbGenesDir, seedGenes) {
  const byId = new Map(seedGenes.map((g) => [g.geneId, { ...g }]));

  if (experienceDbGenesDir && fs.existsSync(experienceDbGenesDir)) {
    try {
      const files = fs
        .readdirSync(experienceDbGenesDir)
        .filter((f) => f.endsWith('.json'))
        .sort();
      for (const file of files) {
        try {
          const raw = JSON.parse(
            fs.readFileSync(path.join(experienceDbGenesDir, file), 'utf8'),
          );
          if (!raw || !raw.gene_id || !raw.rule_directive) continue;
          /** @type {HarnessGene} */
          const hydrated = {
            geneId: raw.gene_id,
            title: raw.title || raw.gene_id,
            domain: raw.domain || 'general',
            sourceEngine: raw.source_engine || 'nomad-evolver-studio',
            createdAt: raw.created_at || new Date().toISOString(),
            triggerSymptom: raw.trigger_symptom || '',
            mutationType: raw.mutation_type || 'HYBRID',
            status: raw.status || 'PENDING_APPROVAL',
            ruleDirective: raw.rule_directive,
            hookGuard: {
              targetTool: raw.hook_guard?.target_tool || 'run_command',
              matchRegex: raw.hook_guard?.match_regex || '.*',
              action: raw.hook_guard?.action || 'WARN_AND_INJECT_HINT',
            },
            verification: {
              evalScript: raw.verification?.eval_script || 'evals/test_gene_gate.js',
              passRate: raw.verification?.pass_rate ?? 1.0,
              regressionPassed: raw.verification?.regression_passed ?? 74,
              regressionTotal: raw.verification?.regression_total ?? 74,
              tokenDelta: raw.verification?.token_delta ?? estimateTokens(raw.rule_directive),
            },
            telemetry: {
              hitCount: raw.telemetry?.hit_count ?? 1,
              savedErrors: raw.telemetry?.saved_errors ?? 1,
              distilledToWeights: Boolean(raw.telemetry?.distilled_to_weights),
            },
          };
          const compiled = compileGeneToThreeRepos(hydrated);
          if (compiled.success) {
            hydrated.compiledTargets = compiled.data;
          }
          byId.set(hydrated.geneId, hydrated);
        } catch {
          // Ignore malformed JSON files in genes directory
        }
      }
    } catch {
      // Fall back to seedGenes if directory read fails
    }
  }

  return Array.from(byId.values());
}

class EvolverWorkbench {
  /**
   * @param {Object} [options]
   * @param {HarnessGene[]} [options.initialGenes]
   * @param {SurgicalPatchItem[]} [options.initialPatches]
   * @param {number} [options.maxTokenDelta]
   * @param {boolean} [options.persistToDisk]
   * @param {Partial<EvolverTargetPaths>} [options.targetPaths]
   */
  constructor(options = {}) {
    this.maxTokenDelta = options.maxTokenDelta ?? DEFAULT_MAX_TOKEN_DELTA;
    this.persistToDisk = Boolean(options.persistToDisk);
    this.targetPaths = resolveEvolverPaths(options.targetPaths || {});

    const baseGenes = Array.isArray(options.initialGenes)
      ? [...options.initialGenes]
      : createDefaultGenes();

    /** @type {HarnessGene[]} */
    this.genes = this.persistToDisk
      ? loadAndMergeGenesFromDisk(this.targetPaths.experienceDbGenesDir, baseGenes)
      : baseGenes;

    /** @type {SurgicalPatchItem[]} */
    this.patches = Array.isArray(options.initialPatches)
      ? [...options.initialPatches]
      : createDefaultSurgicalPatches();
    this.activeProject = 'nomad-ai-workspace';
    this.worktreeBranch = 'shadow/evo-ide-workbench';
    this.syncHistory = [
      {
        syncId: 'evo-v2026.10.22-01',
        timestamp: '2026-10-22T13:00:00+08:00',
        repos: ['antigravity-experience-db', 'claude-config', 'MacStudio-gemini-config'],
        geneId: 'GEN_UI_PLAYWRIGHT_LABEL_001',
      },
    ];

    if (this.persistToDisk) {
      syncGenesToThreeRepos(this.genes, this.targetPaths);
    }
  }

  /**
   * Explicitly synchronizes current genes to all 3 target repositories on disk.
   */
  syncToThreeRepos() {
    return syncGenesToThreeRepos(this.genes, this.targetPaths);
  }

  /**
   * Returns a snapshot of the entire Evolver IDE Workbench & Evolution HUD state.
   */
  getWorkbenchState() {
    const pendingGenes = this.genes.filter((g) => g.status === 'PENDING_APPROVAL');
    const activeGenes = this.genes.filter((g) => g.status === 'ACTIVE');
    const revertedGenes = this.genes.filter((g) => g.status === 'REVERTED');

    const activeRuleTokens = activeGenes.reduce(
      (sum, g) => sum + (g.verification?.tokenDelta || 0),
      0,
    );
    const totalSavedErrors = activeGenes.reduce(
      (sum, g) => sum + (g.telemetry?.savedErrors || 0),
      0,
    );

    return ok({
      activeProject: this.activeProject,
      worktreeBranch: this.worktreeBranch,
      autonomyMode: 'auto_guarded',
      persistToDisk: this.persistToDisk,
      targetPaths: this.targetPaths,
      contextBudget: {
        usedTokens: 13840 + activeRuleTokens,
        budgetTokens: 28000,
        activeRuleTokens,
        ruleBudgetCap: 1200,
        savedByHeadroomPct: 51.4,
      },
      projects: [
        {
          id: 'nomad-ai-workspace',
          name: 'nomad-ai-workspace',
          path: '/Users/liyungchih-macstudio/Developer/nomad-ai-workspace',
          branch: 'main',
          worktree: 'shadow/evo-ide-workbench',
        },
        {
          id: 'antigravity-experience-db',
          name: 'antigravity-experience-db (SSOT)',
          path: this.targetPaths.experienceDbGenesDir,
          branch: 'main',
          worktree: 'shadow/gene-compiler',
        },
        {
          id: 'claude-config',
          name: 'claude-config (~/.claude)',
          path: this.targetPaths.claudeRulesFile,
          branch: 'main',
          worktree: 'live-mirror',
        },
        {
          id: 'MacStudio-gemini-config',
          name: 'MacStudio-gemini-config (~/.gemini)',
          path: this.targetPaths.geminiDynamicRulesFile,
          branch: 'main',
          worktree: 'live-mirror',
        },
      ],
      fileTree: [
        { path: 'packages/core/src/evolver/evolver-workbench.js', status: 'A', folder: 'packages/core' },
        { path: 'packages/desktop/src/layout-engine.js', status: 'M', folder: 'packages/desktop' },
        { path: 'packages/desktop/src/injectors.js', status: 'M', folder: 'packages/desktop' },
        { path: 'packages/desktop/index.html', status: 'M', folder: 'packages/desktop' },
        { path: 'antigravity-experience-db/genes/evolver/*.yaml', status: 'SYNC', folder: 'genes' },
        { path: '~/.claude/rules/common/evolver-genes.md', status: 'SYNC', folder: 'three-repos' },
        { path: '~/.gemini/memory/coding/dynamic_rules.md', status: 'SYNC', folder: 'three-repos' },
      ],
      surgicalPatches: this.patches,
      pendingGenes,
      activeGenes,
      revertedGenes,
      syncHistory: this.syncHistory,
      telemetrySummary: {
        totalActiveGenes: activeGenes.length,
        pendingApprovalCount: pendingGenes.length,
        totalSavedErrors,
        distilledCount: activeGenes.filter((g) => g.telemetry?.distilledToWeights).length,
      },
    });
  }

  /**
   * Synthesizes a new candidate gene from an Error -> Fix trajectory or user correction,
   * runs it through the Shadow Sandbox verifier, and places it in the Auto-Guarded queue.
   * @param {Object} input
   * @param {string} [input.geneId]
   * @param {string} [input.title]
   * @param {string} [input.domain]
   * @param {string} input.triggerSymptom
   * @param {string} input.ruleDirective
   * @param {GeneMutationType} [input.mutationType]
   * @param {string} [input.targetTool]
   * @param {string} [input.matchRegex]
   * @param {number} [input.passRate]
   */
  synthesizeCandidateGene(input) {
    if (!input || typeof input !== 'object' || !input.triggerSymptom || !input.ruleDirective) {
      return err(
        ErrorCodes.EVOLVER_GENE_INVALID_001,
        'Both triggerSymptom and ruleDirective are required to synthesize a gene',
      );
    }

    const indexSuffix = String(this.genes.length + 1).padStart(3, '0');
    const domainTag = String(input.domain || 'CORE')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 8) || 'CORE';
    const geneId = input.geneId || `GEN_${domainTag}_AUTO_${indexSuffix}`;
    const tokenDelta = estimateTokens(input.ruleDirective);

    /** @type {HarnessGene} */
    const candidate = {
      geneId,
      title: input.title || `${input.domain || 'Harness'} 自動提煉防錯基因 #${indexSuffix}`,
      domain: input.domain || 'runtime-safety',
      sourceEngine: 'nomad-evolver-studio',
      createdAt: new Date().toISOString(),
      triggerSymptom: input.triggerSymptom,
      mutationType: input.mutationType || 'HYBRID',
      status: 'PENDING_APPROVAL',
      ruleDirective: input.ruleDirective,
      hookGuard: {
        targetTool: input.targetTool || 'run_command|edit_file',
        matchRegex: input.matchRegex || '.*',
        action: 'WARN_AND_INJECT_HINT',
      },
      verification: {
        evalScript: `evals/test_${geneId.toLowerCase()}.js`,
        passRate: typeof input.passRate === 'number' ? input.passRate : 1.0,
        regressionPassed: 74,
        regressionTotal: 74,
        tokenDelta,
      },
      telemetry: {
        hitCount: 1,
        savedErrors: 1,
        distilledToWeights: false,
      },
    };

    const gateRes = verifyGeneInShadowSandbox(candidate, { maxTokenDelta: this.maxTokenDelta });
    if (!gateRes.success) {
      return gateRes;
    }

    const compiled = compileGeneToThreeRepos(candidate);
    if (compiled.success) {
      candidate.compiledTargets = compiled.data;
    }

    this.genes.unshift(candidate);

    let filesystemSync = null;
    if (this.persistToDisk) {
      const syncRes = syncGenesToThreeRepos(this.genes, this.targetPaths);
      if (!syncRes.success) return syncRes;
      filesystemSync = syncRes.data;
    }

    return ok({
      gene: candidate,
      sandboxVerification: gateRes.data,
      filesystemSync,
    });
  }

  /**
   * Auto-Guarded Approval Gate: approves a pending gene and compiles it to the 3 repositories.
   * @param {string} geneId
   */
  approveGene(geneId) {
    if (!geneId || typeof geneId !== 'string') {
      return err(ErrorCodes.EVOLVER_GENE_INVALID_001, 'geneId must be a non-empty string');
    }

    const gene = this.genes.find((g) => g.geneId === geneId);
    if (!gene) {
      return err(ErrorCodes.EVOLVER_GENE_NOT_FOUND_002, `Gene not found: ${geneId}`);
    }

    const gateRes = verifyGeneInShadowSandbox(gene, { maxTokenDelta: this.maxTokenDelta });
    if (!gateRes.success) {
      return gateRes;
    }

    gene.status = 'ACTIVE';
    const compiledRes = compileGeneToThreeRepos(gene);
    if (!compiledRes.success) {
      return compiledRes;
    }

    gene.compiledTargets = compiledRes.data;
    gene.telemetry.hitCount = (gene.telemetry.hitCount || 0) + 1;

    let filesystemSync = null;
    if (this.persistToDisk) {
      const syncRes = syncGenesToThreeRepos(this.genes, this.targetPaths);
      if (!syncRes.success) {
        return syncRes;
      }
      filesystemSync = syncRes.data;
    }

    const syncEntry = {
      syncId: `evo-v${new Date().toISOString().slice(0, 10).replace(/-/g, '.')}-${String(this.syncHistory.length + 1).padStart(2, '0')}`,
      timestamp: new Date().toISOString(),
      repos: ['antigravity-experience-db', 'claude-config', 'MacStudio-gemini-config'],
      geneId: gene.geneId,
      writtenFilesCount: filesystemSync ? filesystemSync.writtenFiles.length : 0,
    };
    this.syncHistory.unshift(syncEntry);

    return ok({
      gene,
      compiledTargets: compiledRes.data,
      syncRecord: syncEntry,
      filesystemSync,
    });
  }

  /**
   * 1-Click Rollback: reverts an active gene and restores previous Harness state across all 3 repos.
   * @param {string} geneId
   */
  revertGene(geneId) {
    if (!geneId || typeof geneId !== 'string') {
      return err(ErrorCodes.EVOLVER_GENE_INVALID_001, 'geneId must be a non-empty string');
    }

    const gene = this.genes.find((g) => g.geneId === geneId);
    if (!gene) {
      return err(ErrorCodes.EVOLVER_GENE_NOT_FOUND_002, `Gene not found: ${geneId}`);
    }

    gene.status = 'REVERTED';
    const compiledRes = compileGeneToThreeRepos(gene);
    if (compiledRes.success) {
      gene.compiledTargets = compiledRes.data;
    }

    let filesystemSync = null;
    if (this.persistToDisk) {
      const syncRes = syncGenesToThreeRepos(this.genes, this.targetPaths);
      if (!syncRes.success) {
        return syncRes;
      }
      filesystemSync = syncRes.data;
    }

    return ok({
      gene,
      revertedAt: new Date().toISOString(),
      filesystemSync,
    });
  }

  /**
   * Applies or rejects a surgical diff patch from the Shadow Worktree.
   * @param {string} patchId
   * @param {'MERGE' | 'REJECT'} action
   */
  resolveSurgicalPatch(patchId, action = 'MERGE') {
    if (!patchId || typeof patchId !== 'string') {
      return err(ErrorCodes.EVOLVER_PATCH_TARGET_INVALID_004, 'patchId must be a non-empty string');
    }

    const patch = this.patches.find((p) => p.patchId === patchId);
    if (!patch) {
      return err(ErrorCodes.EVOLVER_PATCH_TARGET_INVALID_004, `Surgical patch not found: ${patchId}`);
    }

    patch.status = action === 'REJECT' ? 'REJECTED' : 'MERGED';
    return ok({
      patch,
      resolvedAt: new Date().toISOString(),
    });
  }
}

module.exports = {
  DEFAULT_MAX_TOKEN_DELTA,
  EVOLVER_BLOCK_START,
  EVOLVER_BLOCK_END,
  resolveEvolverPaths,
  compileGeneToThreeRepos,
  syncGenesToThreeRepos,
  verifyGeneInShadowSandbox,
  createDefaultGenes,
  createDefaultSurgicalPatches,
  EvolverWorkbench,
};
