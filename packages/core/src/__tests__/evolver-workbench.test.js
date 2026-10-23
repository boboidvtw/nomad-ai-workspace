const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  ErrorCodes,
  compileGeneToThreeRepos,
  verifyGeneInShadowSandbox,
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
  assert.match(res.data.claudeConfigPatch, /\[claude-config\] Auto-Compiled Gene: GEN_TEST_COMPILER_001/);
  assert.match(res.data.geminiConfigPatch, /\[MacStudio-gemini-config\] Auto-Compiled Gene: GEN_TEST_COMPILER_001/);
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
