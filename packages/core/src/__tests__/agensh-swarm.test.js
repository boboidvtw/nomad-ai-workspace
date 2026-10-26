const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const {
  ErrorCodes,
  TaskDispatcher,
  AgentRoster,
  EvolverWorkbench,
  WorktreeManager,
  P2PBus,
  SharedContextPool,
  handleAgenshRequest,
} = require('../../index');

describe('Agensh Decentralized Multi-Agent Swarm Architecture (RFC-0002)', () => {
  describe('Module 1: Decentralized Self-Claiming Loop (claimNextTask & Token Budget Guard)', () => {
    /** @type {AgentRoster} */
    let roster;
    /** @type {TaskDispatcher} */
    let dispatcher;

    beforeEach(() => {
      roster = new AgentRoster([
        {
          id: 'worker-arch',
          name: 'Claude Architect',
          role: 'Architect',
          platform: 'claude',
          skills: ['architecture', 'typescript', 'refactoring'],
          status: 'idle',
          maxConcurrency: 1,
          budgetTokenLimit: 28000,
          currentTaskIds: [],
        },
        {
          id: 'worker-qa',
          name: 'Grok QA',
          role: 'QA Auditor',
          platform: 'grok',
          skills: ['testing', 'security', 'fuzzing'],
          status: 'idle',
          maxConcurrency: 2,
          budgetTokenLimit: 50000,
          currentTaskIds: [],
        },
      ]);
      dispatcher = new TaskDispatcher({ roster, autoPersist: false });
    });

    it('self-claims the highest-priority unblocked task matching agent skills and role', () => {
      dispatcher.createTask({
        id: 't-low-arch',
        title: 'Low priority arch review',
        priority: 'low',
        metadata: { requiredSkills: ['architecture'] },
      });
      dispatcher.createTask({
        id: 't-urgent-qa',
        title: 'Urgent security fuzzing',
        priority: 'urgent',
        metadata: { requiredSkills: ['security', 'fuzzing'] },
      });
      dispatcher.createTask({
        id: 't-high-arch',
        title: 'High priority TS refactoring',
        priority: 'high',
        metadata: { requiredSkills: ['architecture', 'typescript'] },
      });

      // worker-arch should skip t-urgent-qa (requires security/fuzzing) and pick t-high-arch over t-low-arch
      const resArch = dispatcher.claimNextTask({ agentId: 'worker-arch' });
      assert.equal(resArch.success, true);
      assert.equal(resArch.data.id, 't-high-arch');
      assert.equal(resArch.data.assignee, 'worker-arch');
      assert.equal(resArch.data.status, 'in_progress');

      // worker-arch is now at maxConcurrency (1), further claim should fail with concurrency limit
      const resArch2 = dispatcher.claimNextTask({ agentId: 'worker-arch' });
      assert.equal(resArch2.success, false);
      assert.equal(resArch2.errorCode, ErrorCodes.TASK_CLAIM_CONCURRENCY_LIMIT_012);

      // worker-qa claims t-urgent-qa
      const resQa = dispatcher.claimNextTask({ agentId: 'worker-qa' });
      assert.equal(resQa.success, true);
      assert.equal(resQa.data.id, 't-urgent-qa');
    });

    it('enforces Token Budget Guard and skips tasks exceeding remainingTokenBudget', () => {
      dispatcher.createTask({
        id: 't-heavy',
        title: 'Massive monolith rewrite',
        priority: 'urgent',
        metadata: { requiredSkills: ['architecture'], estimatedTokens: 40000 },
      });
      dispatcher.createTask({
        id: 't-surgical',
        title: 'Surgical AST patch',
        priority: 'medium',
        metadata: { requiredSkills: ['architecture'], estimatedTokens: 8000 },
      });

      // worker-arch has budgetTokenLimit=28000, so t-heavy (40000) is skipped in favor of t-surgical (8000)
      const claimRes = dispatcher.claimNextTask({
        agentId: 'worker-arch',
        remainingTokenBudget: 15000,
      });
      assert.equal(claimRes.success, true);
      assert.equal(claimRes.data.id, 't-surgical');
    });

    it('automatically sweeps expired heartbeat leases before self-claiming', async () => {
      dispatcher.createTask({
        id: 't-expiring',
        title: 'Task with short lease',
        priority: 'high',
        metadata: { requiredSkills: ['testing'] },
      });

      const firstClaim = dispatcher.claimTask('t-expiring', 'worker-qa', 15);
      assert.equal(firstClaim.success, true);

      await new Promise((r) => setTimeout(r, 30));

      // Now worker-qa (or another testing agent) calls claimNextTask; expired lease is swept and reclaimed
      const secondClaim = dispatcher.claimNextTask({ agentId: 'worker-qa' });
      assert.equal(secondClaim.success, true);
      assert.equal(secondClaim.data.id, 't-expiring');
      assert.equal(secondClaim.data.status, 'in_progress');
    });

    it('supports overloaded claimTask when taskId is null/omitted while preserving backward compatibility', () => {
      dispatcher.createTask({
        id: 't-auto-1',
        title: 'Auto claimable task',
        priority: 'high',
      });

      const claimRes = dispatcher.claimTask(null, 'worker-qa', 30000);
      assert.equal(claimRes.success, true);
      assert.equal(claimRes.data.id, 't-auto-1');
    });
  });

  describe('Module 2: Physical Sandbox Isolation via Git Worktree (WorktreeManager)', () => {
    /** @type {string} */
    let tmpDir;
    /** @type {string} */
    let repoDir;
    /** @type {string} */
    let worktreesRoot;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-agensh-wt-'));
      repoDir = path.join(tmpDir, 'repo');
      worktreesRoot = path.join(tmpDir, 'worktrees');
      fs.mkdirSync(repoDir, { recursive: true });

      execFileSync('git', ['init', '-b', 'main'], { cwd: repoDir });
      execFileSync('git', ['config', 'user.email', 'test@nomad.local'], { cwd: repoDir });
      execFileSync('git', ['config', 'user.name', 'Nomad Test Worker'], { cwd: repoDir });

      fs.writeFileSync(path.join(repoDir, 'math.js'), 'module.exports = { add: (a, b) => a + b };\n');
      execFileSync('git', ['add', '.'], { cwd: repoDir });
      execFileSync('git', ['commit', '-m', 'chore: initial commit'], { cwd: repoDir });
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    it('creates isolated Git worktree, blocks unverified merge (Verify Gate), verifies tests, and merges cleanly', () => {
      const manager = new WorktreeManager({
        repoRoot: repoDir,
        worktreeBaseDir: worktreesRoot,
        maxConcurrentWorktrees: 2,
      });

      const wtRes = manager.createWorktree({
        taskId: 'task-101',
        agentId: 'worker-arch',
      });
      assert.equal(wtRes.success, true);
      assert.equal(fs.existsSync(wtRes.data.worktreePath), true);
      assert.equal(wtRes.data.verified, false);

      // Modify file inside isolated worktree
      fs.writeFileSync(
        path.join(wtRes.data.worktreePath, 'math.js'),
        'module.exports = { add: (a, b) => a + b, mul: (a, b) => a * b };\n',
      );
      execFileSync('git', ['add', '.'], { cwd: wtRes.data.worktreePath });
      execFileSync('git', ['commit', '-m', 'feat: add mul function'], {
        cwd: wtRes.data.worktreePath,
      });

      // Attempt to merge BEFORE verification -> MUST be blocked by Verify Gate
      const prematureMerge = manager.mergeWorktree({
        taskId: 'task-101',
        targetBranch: 'main',
      });
      assert.equal(prematureMerge.success, false);
      assert.equal(prematureMerge.errorCode, ErrorCodes.WORKTREE_VERIFY_GATE_BLOCKED_004);

      // Run Verify Gate inside worktree
      const verifyRes = manager.verifyWorktree({
        taskId: 'task-101',
        testCommand: `node -e "const m = require('./math.js'); if (m.mul(3, 4) !== 12) process.exit(1);"`,
      });
      assert.equal(verifyRes.success, true);
      assert.equal(verifyRes.data.verified, true);

      // Now merge into main -> MUST succeed and clean up worktree
      const mergeRes = manager.mergeWorktree({
        taskId: 'task-101',
        targetBranch: 'main',
        cleanupAfterMerge: true,
      });
      assert.equal(mergeRes.success, true);
      assert.equal(mergeRes.data.merged, true);

      // Verify main repo has the merged change
      const mainMathContent = fs.readFileSync(path.join(repoDir, 'math.js'), 'utf8');
      assert.equal(mainMathContent.includes('mul: (a, b) => a * b'), true);
    });

    it('enforces maxConcurrentWorktrees limit and detects Git merge conflicts cleanly', () => {
      const manager = new WorktreeManager({
        repoRoot: repoDir,
        worktreeBaseDir: worktreesRoot,
        maxConcurrentWorktrees: 1,
      });

      const wt1 = manager.createWorktree({ taskId: 'task-c1', agentId: 'worker-1' });
      assert.equal(wt1.success, true);

      // Exceeding maxConcurrentWorktrees (1) must return WORKTREE_CONCURRENCY_EXCEEDED_002
      const wt2 = manager.createWorktree({ taskId: 'task-c2', agentId: 'worker-2' });
      assert.equal(wt2.success, false);
      assert.equal(wt2.errorCode, ErrorCodes.WORKTREE_CONCURRENCY_EXCEEDED_002);

      // Create conflicting commit on main and in wt1
      fs.writeFileSync(path.join(repoDir, 'math.js'), 'module.exports = { add: (a, b) => a + b + 1 };\n');
      execFileSync('git', ['add', '.'], { cwd: repoDir });
      execFileSync('git', ['commit', '-m', 'main conflicting edit'], { cwd: repoDir });

      fs.writeFileSync(
        path.join(wt1.data.worktreePath, 'math.js'),
        'module.exports = { add: (a, b) => a + b + 999 };\n',
      );
      execFileSync('git', ['add', '.'], { cwd: wt1.data.worktreePath });
      execFileSync('git', ['commit', '-m', 'worktree conflicting edit'], {
        cwd: wt1.data.worktreePath,
      });

      manager.verifyWorktree({
        taskId: 'task-c1',
        verifyFn: () => ({ passed: true, summary: 'Unit test passed' }),
      });

      const conflictMerge = manager.mergeWorktree({
        taskId: 'task-c1',
        targetBranch: 'main',
      });
      assert.equal(conflictMerge.success, false);
      assert.equal(conflictMerge.errorCode, ErrorCodes.WORKTREE_MERGE_CONFLICT_005);

      // Clean up
      const cleanRes = manager.cleanupWorktree('task-c1', { force: true });
      assert.equal(cleanRes.success, true);
    });
  });

  describe('Module 3: Peer-to-Peer Conflict Negotiation & Interface Lock (P2PBus)', () => {
    it('routes direct messages, auto-registers [CONTRACT_LOCKED] declarations, and blocks conflicting mutations', () => {
      const events = [];
      const p2p = new P2PBus({
        onEvent: (type, payload) => events.push({ type, payload }),
      });

      // Worker A sends a direct message with [CONTRACT_LOCKED] declaration to Worker B
      const msgRes = p2p.sendDirectMessage({
        fromAgentId: 'worker-arch',
        toAgentId: 'worker-qa',
        taskId: 'task-101',
        content:
          '[CONTRACT_LOCKED] packages/core/src/auth.js: authorizeRequest(req) => UnitResult<boolean, ErrorCode>',
      });
      assert.equal(msgRes.success, true);
      assert.equal(msgRes.data.contractLocked, true);

      // Contract is now active
      const contracts = p2p.getContracts();
      assert.equal(contracts.length, 1);
      assert.equal(contracts[0].modulePath, 'packages/core/src/auth.js');
      assert.equal(contracts[0].ownerAgentId, 'worker-arch');

      // Worker B attempts to lock the same module with a different signature -> blocked!
      const conflictLock = p2p.lockInterfaceContract({
        agentId: 'worker-qa',
        taskId: 'task-102',
        modulePath: 'packages/core/src/auth.js',
        signature: 'authorizeRequest(req, options) => Promise<boolean>',
      });
      assert.equal(conflictLock.success, false);
      assert.equal(conflictLock.errorCode, ErrorCodes.P2P_CONTRACT_CONFLICT_003);

      // Validate signature against active locks
      const validCheck = p2p.validateAgainstContracts({
        agentId: 'worker-qa',
        modulePath: 'packages/core/src/auth.js',
        proposedSignature: 'authorizeRequest(req) => UnitResult<boolean, ErrorCode>',
      });
      assert.equal(validCheck.success, true);

      const invalidCheck = p2p.validateAgainstContracts({
        agentId: 'worker-qa',
        modulePath: 'packages/core/src/auth.js',
        proposedSignature: 'authorizeRequest(req) => void',
      });
      assert.equal(invalidCheck.success, false);
      assert.equal(invalidCheck.errorCode, ErrorCodes.P2P_CONTRACT_CONFLICT_003);

      // Events emitted include agent:direct_message and contract:locked
      assert.equal(events.some((e) => e.type === 'agent:direct_message'), true);
      assert.equal(events.some((e) => e.type === 'contract:locked'), true);
    });
  });

  describe('Module 4: Shared Context Pool & Failure Log Immunization (SharedContextPool)', () => {
    /** @type {string} */
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-agensh-ctx-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });

    it('publishes findings, broadcasts failure immunizations to Evolver/Experience-DB, and gathers token-capped context', () => {
      const evolver = new EvolverWorkbench({
        paths: {
          experienceDbDir: path.join(tmpDir, 'exp-db'),
          claudeRulesFile: path.join(tmpDir, 'claude-rules.md'),
          claudeHooksFile: path.join(tmpDir, 'claude-hooks.json'),
          geminiDynamicRulesFile: path.join(tmpDir, 'gemini-rules.md'),
        },
      });
      const p2p = new P2PBus();
      const pool = new SharedContextPool({
        evolverWorkbench: evolver,
        p2pBus: p2p,
        experienceLibraryRoot: path.join(tmpDir, 'library'),
      });

      // 1. Lock an interface contract on P2PBus
      p2p.lockInterfaceContract({
        agentId: 'worker-arch',
        taskId: 'task-201',
        modulePath: 'packages/core/src/tasks/dispatcher.js',
        signature: 'claimNextTask(options) => UnitResult<Task, ErrorCode>',
      });

      // 2. Publish a reusable finding
      const findRes = pool.publishFinding({
        agentId: 'worker-arch',
        taskId: 'task-201',
        domain: 'tasks',
        title: 'Lease expiry sweep order',
        content: 'Always call checkExpiredLeases() before filtering TODO tasks in claimNextTask.',
        tags: ['lease', 'dispatcher'],
      });
      assert.equal(findRes.success, true);

      // 3. Broadcast a failure log -> auto-immunizes pool and distills to Experience-DB
      const failRes = pool.broadcastFailure({
        agentId: 'worker-qa',
        taskId: 'task-202',
        domain: 'tasks',
        errorCode: 'WORKTREE_MERGE_CONFLICT_005',
        symptom: 'Concurrent edits to index.d.ts caused git merge conflict',
        rootCause: 'Workers ran build:types inside individual feature branches before merge',
        mitigation: 'Only run build:types on main branch after merging source JS files',
      });
      assert.equal(failRes.success, true);
      assert.equal(Boolean(failRes.data.immunization.id), true);
      assert.equal(failRes.data.experienceDistilled, true);

      // 4. Step 1 of Worker Loop: Gather Context with strict token budget
      const gatherRes = pool.gatherContext({
        agentId: 'worker-local',
        domain: 'tasks',
        maxTokenBudget: 2000,
      });
      assert.equal(gatherRes.success, true);
      assert.equal(gatherRes.data.findings.length, 1);
      assert.equal(gatherRes.data.immunizations.length, 1);
      assert.equal(gatherRes.data.contracts.length, 1);
      assert.equal(gatherRes.data.totalTokens <= 2000, true);
    });
  });

  describe('Module 5: Unified HTTP Gateway (handleAgenshRequest)', () => {
    it('serves /api/agensh/* endpoints with consistent UnitResult responses', async () => {
      const roster = new AgentRoster();
      const dispatcher = new TaskDispatcher({ roster, autoPersist: false });
      const p2pBus = new P2PBus();
      const sharedContext = new SharedContextPool({ p2pBus });
      const worktreeManager = new WorktreeManager({
        repoRoot: process.cwd(),
        worktreeBaseDir: path.join(os.tmpdir(), 'nomad-wt-route-test'),
      });

      const services = {
        dispatcher,
        worktreeManager,
        p2pBus,
        sharedContext,
      };

      // Post a P2P message via HTTP handler
      const p2pRes = await handleAgenshRequest({
        method: 'POST',
        pathname: '/api/agensh/p2p/message',
        searchParams: new URLSearchParams(),
        readBody: async () => ({
          fromAgentId: 'agent-claude',
          toAgentId: 'agent-gemini',
          taskId: 'task-1',
          content: '[CONTRACT_LOCKED] packages/core/index.js: export WorktreeManager',
        }),
        services,
      });
      assert.ok(p2pRes);
      assert.equal(p2pRes.status, 200);
      assert.equal(p2pRes.payload.success, true);

      // Get Agensh Swarm status
      const statusRes = await handleAgenshRequest({
        method: 'GET',
        pathname: '/api/agensh/status',
        searchParams: new URLSearchParams(),
        readBody: async () => ({}),
        services,
      });
      assert.ok(statusRes);
      assert.equal(statusRes.status, 200);
      assert.equal(statusRes.payload.success, true);
      assert.equal(statusRes.payload.data.contracts.length, 1);
    });
  });
});
