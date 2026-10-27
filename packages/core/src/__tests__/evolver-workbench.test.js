const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ErrorCodes,
  compileGeneToThreeRepos,
  verifyGeneInShadowSandbox,
  HARNESS2_COST_HIERARCHY,
  HARNESS2_COST_CONSTITUTION,
  recommendComponentForm,
  autoRepairSkillTriggers,
  validateHarnessSurface,
  selectCandidateAnonymously,
  EvolverWorkbench,
} = require('../../index.js');

test('EvolverWorkbench: getWorkbenchState returns initial three-pane IDE state and active genes', () => {
  const wb = new EvolverWorkbench();
  const res = wb.getWorkbenchState();

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data.autonomyMode, 'auto_guarded');
  assert.strictEqual(res.data.activeProject, 'nomad-ai-workspace');
  assert.ok(res.data.pendingGenes.length >= 1);
  assert.ok(res.data.activeGenes.length >= 3);
  assert.ok(res.data.surgicalPatches.length >= 3);
  assert.strictEqual(res.data.surgicalPatches[0].diff.stats.added > 0, true);
});

test('EvolverWorkbench: compileGeneToThreeRepos generates antigravity-experience-db, claude-config, and MacStudio-gemini-config payloads', () => {
  const res = compileGeneToThreeRepos({
    geneId: 'GEN_TEST_COMPILER_001',
    title: 'Test Compiler Gene',
    domain: 'unit-test',
    sourceEngine: 'antigravity',
    createdAt: '2026-10-22T12:00:00Z',
    triggerSymptom: 'Command failed with error X',
    mutationType: 'HYBRID',
    status: 'PENDING_APPROVAL',
    ruleDirective: 'Always run preflight check before executing X.',
    hookGuard: {
      targetTool: 'run_command',
      matchRegex: 'exec_x',
      action: 'WARN_AND_INJECT_HINT',
    },
    verification: {
      evalScript: 'evals/test_x.js',
      passRate: 1.0,
      regressionPassed: 10,
      regressionTotal: 10,
      tokenDelta: 15,
    },
    telemetry: {
      hitCount: 1,
      savedErrors: 1,
      distilledToWeights: false,
    },
  });

  assert.strictEqual(res.success, true);
  assert.match(res.data.experienceDbYaml, /gene_id: GEN_TEST_COMPILER_001/);
  assert.match(
    res.data.claudeConfigPatch,
    /\[claude-config\] Auto-Compiled Gene: GEN_TEST_COMPILER_001/,
  );
  assert.match(
    res.data.geminiConfigPatch,
    /\[MacStudio-gemini-config\] Auto-Compiled Gene: GEN_TEST_COMPILER_001/,
  );
});

test('EvolverWorkbench: verifyGeneInShadowSandbox enforces passRate=1.0 and token budget cap', () => {
  const failRegression = verifyGeneInShadowSandbox({
    geneId: 'GEN_FAIL_REG_001',
    ruleDirective: 'Some rule',
    verification: { passRate: 0.85, tokenDelta: 20 },
  });
  assert.strictEqual(failRegression.success, false);
  assert.strictEqual(failRegression.errorCode, ErrorCodes.EVOLVER_SANDBOX_GATE_FAILED_003);

  const failBudget = verifyGeneInShadowSandbox(
    {
      geneId: 'GEN_FAIL_BUDGET_002',
      ruleDirective: 'Some rule that is way over budget',
      verification: { passRate: 1.0, tokenDelta: 250 },
    },
    { maxTokenDelta: 120 },
  );
  assert.strictEqual(failBudget.success, false);
  assert.strictEqual(failBudget.errorCode, ErrorCodes.EVOLVER_SANDBOX_GATE_FAILED_003);
});

test('EvolverWorkbench: synthesizeCandidateGene -> approveGene (Auto-Guarded) -> revertGene (1-Click Rollback)', () => {
  const wb = new EvolverWorkbench();

  // 1. Synthesize candidate gene from trajectory failure -> fix
  const synthRes = wb.synthesizeCandidateGene({
    domain: 'sqlite-concurrency',
    title: 'SQLite WAL 鎖定防呆協定',
    triggerSymptom: 'SQLITE_BUSY: database is locked during concurrent subagent writes',
    ruleDirective: '開啟 SQLite 連線時必須立即執行 PRAGMA journal_mode=WAL; 與 busy_timeout=5000。',
    mutationType: 'HYBRID',
    targetTool: 'edit_file',
    matchRegex: 'sqlite3\\.connect',
  });

  assert.strictEqual(synthRes.success, true);
  const newGeneId = synthRes.data.gene.geneId;
  assert.strictEqual(synthRes.data.gene.status, 'PENDING_APPROVAL');

  // 2. Approve via Auto-Guarded gate
  const approveRes = wb.approveGene(newGeneId);
  assert.strictEqual(approveRes.success, true);
  assert.strictEqual(approveRes.data.gene.status, 'ACTIVE');
  assert.deepStrictEqual(approveRes.data.syncRecord.repos, [
    'antigravity-experience-db',
    'claude-config',
    'MacStudio-gemini-config',
  ]);

  // 3. 1-Click Rollback
  const revertRes = wb.revertGene(newGeneId);
  assert.strictEqual(revertRes.success, true);
  assert.strictEqual(revertRes.data.gene.status, 'REVERTED');
});

test('EvolverWorkbench: resolveSurgicalPatch merges or rejects Shadow Worktree diffs', () => {
  const wb = new EvolverWorkbench();
  const mergeRes = wb.resolveSurgicalPatch('PATCH_LAYOUT_EVOLVER_001', 'MERGE');
  assert.strictEqual(mergeRes.success, true);
  assert.strictEqual(mergeRes.data.patch.status, 'MERGED');

  const rejectRes = wb.resolveSurgicalPatch('PATCH_LEXICAL_INJECTOR_002', 'REJECT');
  assert.strictEqual(rejectRes.success, true);
  assert.strictEqual(rejectRes.data.patch.status, 'REJECTED');

  const missingRes = wb.resolveSurgicalPatch('NON_EXISTENT', 'MERGE');
  assert.strictEqual(missingRes.success, false);
  assert.strictEqual(missingRes.errorCode, ErrorCodes.EVOLVER_PATCH_TARGET_INVALID_004);
});

test('EvolverWorkbench Phase 2: persistToDisk writes YAML/JSON to experience-db, rules/hooks to claude-config, and dynamic_rules.md to gemini-config, and purges on revertGene', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-evolver-p2-'));
  try {
    const targetPaths = {
      experienceDbGenesDir: path.join(tmpRoot, 'experience-db', 'genes', 'evolver'),
      claudeRulesFile: path.join(tmpRoot, '.claude', 'rules', 'common', 'evolver-genes.md'),
      claudeHooksFile: path.join(tmpRoot, '.claude', 'hooks', 'evolver-guard-rules.json'),
      claudeRepoDir: path.join(tmpRoot, 'claude-config-repo'),
      geminiDynamicRulesFile: path.join(tmpRoot, '.gemini', 'memory', 'coding', 'dynamic_rules.md'),
    };
    fs.mkdirSync(targetPaths.claudeRepoDir, { recursive: true });
    fs.mkdirSync(path.dirname(targetPaths.geminiDynamicRulesFile), { recursive: true });
    fs.writeFileSync(
      targetPaths.geminiDynamicRulesFile,
      '# 🧠 動態核心知識與規則 (Dynamic Knowledge)\n\n## 🎭 已學習的設計模式 (Design Patterns)\n- 既有模式 A\n',
      'utf8',
    );

    const wb = new EvolverWorkbench({
      persistToDisk: true,
      targetPaths,
    });

    // Approve pending seed gene GEN_DOM_LEXICAL_INSERT_005
    const approveRes = wb.approveGene('GEN_DOM_LEXICAL_INSERT_005');
    assert.strictEqual(approveRes.success, true);
    assert.ok(approveRes.data.filesystemSync);
    assert.ok(approveRes.data.filesystemSync.writtenFiles.length >= 5);

    // Verify Repo 1: antigravity-experience-db YAML + JSON
    const geneYamlPath = path.join(
      targetPaths.experienceDbGenesDir,
      'GEN_DOM_LEXICAL_INSERT_005.yaml',
    );
    const geneJsonPath = path.join(
      targetPaths.experienceDbGenesDir,
      'GEN_DOM_LEXICAL_INSERT_005.json',
    );
    assert.strictEqual(fs.existsSync(geneYamlPath), true);
    assert.strictEqual(fs.existsSync(geneJsonPath), true);
    const geneJson = JSON.parse(fs.readFileSync(geneJsonPath, 'utf8'));
    assert.strictEqual(geneJson.status, 'ACTIVE');
    assert.ok(Array.isArray(geneJson.capabilities));
    assert.strictEqual(geneJson.capabilities[0].gene_id, 'GEN_DOM_LEXICAL_INSERT_005');

    // Verify Repo 2: claude-config (~/.claude/rules/common/evolver-genes.md + hooks + repo mirror)
    const claudeMd = fs.readFileSync(targetPaths.claudeRulesFile, 'utf8');
    assert.match(claudeMd, /GEN_DOM_LEXICAL_INSERT_005/);
    const claudeHooks = JSON.parse(fs.readFileSync(targetPaths.claudeHooksFile, 'utf8'));
    assert.ok(claudeHooks.activeGuards.some((g) => g.geneId === 'GEN_DOM_LEXICAL_INSERT_005'));
    const mirroredClaudeMd = path.join(
      targetPaths.claudeRepoDir,
      'rules',
      'common',
      'evolver-genes.md',
    );
    assert.strictEqual(fs.existsSync(mirroredClaudeMd), true);

    // Verify Repo 3: MacStudio-gemini-config (preserves existing header + injects Evolver block)
    const geminiMd = fs.readFileSync(targetPaths.geminiDynamicRulesFile, 'utf8');
    assert.match(geminiMd, /既有模式 A/);
    assert.match(geminiMd, /GEN_DOM_LEXICAL_INSERT_005/);

    // Verify 1-Click Rollback removes the gene from active Claude & Gemini rules
    const revertRes = wb.revertGene('GEN_DOM_LEXICAL_INSERT_005');
    assert.strictEqual(revertRes.success, true);

    const claudeMdAfterRevert = fs.readFileSync(targetPaths.claudeRulesFile, 'utf8');
    assert.doesNotMatch(claudeMdAfterRevert, /GEN_DOM_LEXICAL_INSERT_005/);

    const geminiMdAfterRevert = fs.readFileSync(targetPaths.geminiDynamicRulesFile, 'utf8');
    assert.doesNotMatch(geminiMdAfterRevert, /GEN_DOM_LEXICAL_INSERT_005/);

    const revertedJson = JSON.parse(fs.readFileSync(geneJsonPath, 'utf8'));
    assert.strictEqual(revertedJson.status, 'REVERTED');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('Harness² Capability 1: validateHarnessSurface & autoRepairSkillTriggers enforce 4-surface structural checks', () => {
  // 1. Untriggered skill fails with EVOLVER_SURFACE_UNTRIGGERED_SKILL_006, then passes after autoRepairSkillTriggers
  const untriggeredTree = {
    'guardrails.md': '# Core Guardrails\n- Keep changes surgical.\n',
    'skills/sql-audit/SKILL.md':
      '---\nname: sql-audit\ndescription: Audit SQL migrations\n---\nRun `scripts/check_sql.py`.\n',
    'scripts/check_sql.py': 'def main():\n    return True\n',
    'agents/reviewer.toml': 'name = "reviewer"\n',
    '.codex/hooks.json': JSON.stringify({
      hooks: {
        PreToolUse: [{ type: 'command', command: 'python3 scripts/check_sql.py' }],
      },
    }),
  };

  const failUntriggered = validateHarnessSurface(untriggeredTree);
  assert.strictEqual(failUntriggered.success, false);
  assert.strictEqual(failUntriggered.errorCode, ErrorCodes.EVOLVER_SURFACE_UNTRIGGERED_SKILL_006);

  const repairedRes = autoRepairSkillTriggers(untriggeredTree);
  assert.strictEqual(repairedRes.success, true);
  assert.deepStrictEqual(repairedRes.data.repairedSkills, ['sql-audit']);
  assert.match(repairedRes.data.surfaceTree['guardrails.md'], /skills\/sql-audit\/SKILL\.md/);

  const validRes = validateHarnessSurface(repairedRes.data.surfaceTree);
  assert.strictEqual(validRes.success, true);
  assert.strictEqual(validRes.data.valid, true);
  assert.ok(validRes.data.census.alwaysOnChars > 0);
  assert.deepStrictEqual(validRes.data.census.skills, ['sql-audit']);
  assert.deepStrictEqual(validRes.data.census.scripts, ['scripts/check_sql.py']);
  assert.deepStrictEqual(validRes.data.census.subagents, ['reviewer.toml']);
  assert.deepStrictEqual(validRes.data.census.hooks, ['PreToolUse']);

  // 2. Missing or syntax-broken script fails with EVOLVER_SURFACE_SCRIPT_INVALID_007
  const missingScriptTree = {
    ...repairedRes.data.surfaceTree,
  };
  delete missingScriptTree['scripts/check_sql.py'];
  const failMissingScript = validateHarnessSurface(missingScriptTree);
  assert.strictEqual(failMissingScript.success, false);
  assert.strictEqual(failMissingScript.errorCode, ErrorCodes.EVOLVER_SURFACE_SCRIPT_INVALID_007);

  const brokenPyTree = {
    ...repairedRes.data.surfaceTree,
    'scripts/check_sql.py': 'def broken_func(\n    return 1\n',
  };
  const failBrokenPy = validateHarnessSurface(brokenPyTree);
  assert.strictEqual(failBrokenPy.success, false);
  assert.strictEqual(failBrokenPy.errorCode, ErrorCodes.EVOLVER_SURFACE_SCRIPT_INVALID_007);

  const brokenJsTree = {
    ...repairedRes.data.surfaceTree,
    'scripts/helper.js': 'function broken( { return 1; }',
  };
  const failBrokenJs = validateHarnessSurface(brokenJsTree);
  assert.strictEqual(failBrokenJs.success, false);
  assert.strictEqual(failBrokenJs.errorCode, ErrorCodes.EVOLVER_SURFACE_SCRIPT_INVALID_007);

  // 3. Invalid hook event name (snake_case) or non-command type fails with EVOLVER_SURFACE_HOOK_SCHEMA_008
  const badHookEventTree = {
    ...repairedRes.data.surfaceTree,
    '.codex/hooks.json': JSON.stringify({
      hooks: {
        pre_tool_use: [{ type: 'command', command: 'echo ok' }],
      },
    }),
  };
  const failHookEvent = validateHarnessSurface(badHookEventTree);
  assert.strictEqual(failHookEvent.success, false);
  assert.strictEqual(failHookEvent.errorCode, ErrorCodes.EVOLVER_SURFACE_HOOK_SCHEMA_008);

  const badHookTypeTree = {
    ...repairedRes.data.surfaceTree,
    '.codex/hooks.json': JSON.stringify({
      hooks: {
        PreToolUse: [{ type: 'prompt', prompt: 'not allowed' }],
      },
    }),
  };
  const failHookType = validateHarnessSurface(badHookTypeTree);
  assert.strictEqual(failHookType.success, false);
  assert.strictEqual(failHookType.errorCode, ErrorCodes.EVOLVER_SURFACE_HOOK_SCHEMA_008);

  // 4. Always-On budget exceeded or raw Jinja tags fail with EVOLVER_SURFACE_BUDGET_EXCEEDED_009
  const jinjaLeakTree = {
    ...repairedRes.data.surfaceTree,
    'guardrails.md': `${repairedRes.data.surfaceTree['guardrails.md']}\nUnrendered {{ template_var }}`,
  };
  const failJinja = validateHarnessSurface(jinjaLeakTree);
  assert.strictEqual(failJinja.success, false);
  assert.strictEqual(failJinja.errorCode, ErrorCodes.EVOLVER_SURFACE_BUDGET_EXCEEDED_009);

  const overBudgetTree = {
    ...repairedRes.data.surfaceTree,
  };
  const failOverBudget = validateHarnessSurface(overBudgetTree, { alwaysOnMaxChars: 20 });
  assert.strictEqual(failOverBudget.success, false);
  assert.strictEqual(failOverBudget.errorCode, ErrorCodes.EVOLVER_SURFACE_BUDGET_EXCEEDED_009);
});

test('Harness² Capability 2: HARNESS2_COST_HIERARCHY & recommendComponentForm enforce SKILL > SCRIPT > SUBAGENT > HOOK > ALWAYS_ON_RULE', () => {
  assert.deepStrictEqual(HARNESS2_COST_HIERARCHY, [
    'SKILL',
    'SCRIPT',
    'SUBAGENT',
    'HOOK',
    'ALWAYS_ON_RULE',
  ]);
  assert.match(HARNESS2_COST_CONSTITUTION, /SKILL > SCRIPT > SUBAGENT > HOOK > ALWAYS-ON RULE/);

  const skillRec = recommendComponentForm({
    domain: 'database-migrations',
    conditionalWorkflow: true,
  });
  assert.strictEqual(skillRec.success, true);
  assert.strictEqual(skillRec.data.recommendedForm, 'SKILL');
  assert.strictEqual(skillRec.data.rank, 1);

  const scriptRec = recommendComponentForm({
    domain: 'schema-check',
    deterministicCheck: true,
  });
  assert.strictEqual(scriptRec.success, true);
  assert.strictEqual(scriptRec.data.recommendedForm, 'SCRIPT');
  assert.strictEqual(scriptRec.data.rank, 2);

  const subagentRec = recommendComponentForm({
    domain: 'deep-repo-audit',
    isolatedSearch: true,
  });
  assert.strictEqual(subagentRec.success, true);
  assert.strictEqual(subagentRec.data.recommendedForm, 'SUBAGENT');
  assert.strictEqual(subagentRec.data.rank, 3);

  const hookRec = recommendComponentForm({
    domain: 'dangerous-command-block',
    hardGate: true,
  });
  assert.strictEqual(hookRec.success, true);
  assert.strictEqual(hookRec.data.recommendedForm, 'HOOK');
  assert.strictEqual(hookRec.data.rank, 4);

  const ruleRec = recommendComponentForm({
    domain: 'global-safety',
    universalInvariant: true,
    cannotBeTriggeredOnDemand: true,
    estimatedChars: 120,
  });
  assert.strictEqual(ruleRec.success, true);
  assert.strictEqual(ruleRec.data.recommendedForm, 'ALWAYS_ON_RULE');
  assert.strictEqual(ruleRec.data.rank, 5);
});

test('Harness² Capability 3: selectCandidateAnonymously & verifyGeneInShadowSandbox contrastive selection', () => {
  // 1. Grader leak detection
  const leakedRes = selectCandidateAnonymously([
    {
      candidateId: 'cand-1',
      trajectorySummary: 'Checked "pass_rate": 1.0 and read reference_answer.txt',
      checksPassed: 3,
    },
  ]);
  assert.strictEqual(leakedRes.success, false);
  assert.strictEqual(leakedRes.errorCode, ErrorCodes.EVOLVER_SELECT_GRADER_LEAK_010);

  // 2. Blind anonymization, EVIDENCE_BOUNDARY + POOL_MIXED_SELECT envelope, and winning candidate selection
  const validCandidates = [
    {
      candidateId: 'base',
      isBase: true,
      trajectorySummary: 'Executed migration without verifying foreign keys.',
      checksPassed: 1,
      errorsEncountered: 2,
      alwaysOnCharsDelta: 0,
    },
    {
      candidateId: 'GEN_SQL_FK_009',
      trajectorySummary:
        'Loaded skills/sql-audit/SKILL.md and verified all foreign keys via scripts/check_sql.py.',
      checksPassed: 4,
      errorsEncountered: 0,
      alwaysOnCharsDelta: 45,
    },
  ];
  const selectRes = selectCandidateAnonymously(validCandidates);
  assert.strictEqual(selectRes.success, true);
  assert.strictEqual(selectRes.data.winnerId, 'GEN_SQL_FK_009');
  assert.strictEqual(selectRes.data.winnerLabel, 'B');
  assert.strictEqual(selectRes.data.tiedToBase, false);
  assert.strictEqual(selectRes.data.anonymizedPool[0].label, 'A');
  assert.strictEqual(selectRes.data.anonymizedPool[1].label, 'B');
  assert.strictEqual('candidateId' in selectRes.data.anonymizedPool[0], false);
  assert.match(selectRes.data.promptEnvelope, /EVIDENCE_BOUNDARY/);
  assert.match(selectRes.data.promptEnvelope, /POOL_MIXED_SELECT/);

  // 3. Ties resolve to unmodified base harness
  const tiedRes = selectCandidateAnonymously([
    {
      candidateId: 'base',
      isBase: true,
      trajectorySummary: 'Clean execution.',
      checksPassed: 3,
      errorsEncountered: 0,
      alwaysOnCharsDelta: 0,
    },
    {
      candidateId: 'GEN_NOOP_010',
      trajectorySummary: 'Same execution with extra prompt overhead.',
      checksPassed: 3,
      errorsEncountered: 0,
      alwaysOnCharsDelta: 90,
    },
  ]);
  assert.strictEqual(tiedRes.success, true);
  assert.strictEqual(tiedRes.data.winnerId, 'base');
  assert.strictEqual(tiedRes.data.tiedToBase, true);

  // 4. Open-world contrastive mode in verifyGeneInShadowSandbox
  const sandboxPass = verifyGeneInShadowSandbox(
    {
      geneId: 'GEN_SQL_FK_009',
      ruleDirective: 'When editing SQL migrations, load skills/sql-audit/SKILL.md.',
    },
    { contrastiveCandidates: validCandidates },
  );
  assert.strictEqual(sandboxPass.success, true);
  assert.strictEqual(sandboxPass.data.contrastiveSelection.winnerId, 'GEN_SQL_FK_009');

  const sandboxTieFail = verifyGeneInShadowSandbox(
    {
      geneId: 'GEN_NOOP_010',
      ruleDirective: 'Extra rule that does not improve trajectory.',
    },
    {
      contrastiveCandidates: [
        {
          candidateId: 'base',
          isBase: true,
          trajectorySummary: 'Base',
          checksPassed: 3,
          errorsEncountered: 0,
        },
        {
          candidateId: 'GEN_NOOP_010',
          trajectorySummary: 'Noop',
          checksPassed: 3,
          errorsEncountered: 0,
        },
      ],
    },
  );
  assert.strictEqual(sandboxTieFail.success, false);
  assert.strictEqual(sandboxTieFail.errorCode, ErrorCodes.EVOLVER_SANDBOX_GATE_FAILED_003);
});

test('Harness² Capability 4: distillDomainExperience writes EXPERIENCE.md and updates INDEX.md, and EvolverWorkbench exposes all 4 methods', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-harness2-exp-'));
  try {
    const wb = new EvolverWorkbench();

    // Workbench method wrappers
    const formRes = wb.recommendForm({ deterministicCheck: true });
    assert.strictEqual(formRes.success, true);
    assert.strictEqual(formRes.data.recommendedForm, 'SCRIPT');

    const surfaceRes = wb.validateSurface(
      {
        'guardrails.md': '# Guardrails\n',
        'skills/demo-skill/SKILL.md': '# Demo Skill\n',
      },
      { autoRepair: true },
    );
    assert.strictEqual(surfaceRes.success, true);
    assert.strictEqual(surfaceRes.data.valid, true);

    const selectRes = wb.selectCandidate([
      {
        candidateId: 'base',
        isBase: true,
        trajectorySummary: 'Base run',
        checksPassed: 1,
        errorsEncountered: 1,
      },
      {
        candidateId: 'cand-2',
        trajectorySummary: 'Improved run',
        checksPassed: 3,
        errorsEncountered: 0,
      },
    ]);
    assert.strictEqual(selectRes.success, true);
    assert.strictEqual(selectRes.data.winnerId, 'cand-2');

    const distillRes = wb.distillExperience(
      {
        domain: 'webview-automation',
        taskId: 'lexical-editor-paste-01',
        cue: 'Lexical editor drops text when execCommand("insertText") is invoked without prior selectionchange',
        lesson:
          'Use a dedicated skill with pre-focus and selectAll verification script before submitting',
        evidence: 'Saved 3 consecutive silent drops across Copilot and Perplexity webviews',
        confidence: 0.96,
      },
      { libraryRoot: tmpDir },
    );

    assert.strictEqual(distillRes.success, true);
    assert.strictEqual(fs.existsSync(distillRes.data.experiencePath), true);
    assert.strictEqual(fs.existsSync(distillRes.data.indexPath), true);

    const expContent = fs.readFileSync(distillRes.data.experiencePath, 'utf8');
    assert.match(expContent, /lexical-editor-paste-01/);
    assert.match(expContent, /0\.96/);

    const indexContent = fs.readFileSync(distillRes.data.indexPath, 'utf8');
    assert.match(indexContent, /cue:/i);
    assert.match(indexContent, /lesson:/i);
    assert.match(indexContent, /evidence:/i);
    assert.match(indexContent, /confidence:\s*0\.96/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
