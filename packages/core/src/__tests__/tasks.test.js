const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  TASK_STATUS,
  TASK_PRIORITY,
  validateTransition,
  createTaskEntity,
  AGENT_STATUS,
  AgentRoster,
  TaskDispatcher,
  ApprovalGate,
  TaskRunner,
  ErrorCodes,
} = require('../../index');

describe('Task Control Plane - Task Model', () => {
  it('creates valid task entity with default properties and logs', () => {
    const res = createTaskEntity({
      title: 'Implement Authentication API',
      description: 'JWT with Refresh Tokens',
      priority: TASK_PRIORITY.HIGH,
      acceptanceCriteria: ['Unit tests passing', 'No plain text passwords'],
    });

    assert.strictEqual(res.success, true);
    const task = res.data;
    assert.strictEqual(task.title, 'Implement Authentication API');
    assert.strictEqual(task.priority, 'high');
    assert.strictEqual(task.status, TASK_STATUS.TODO);
    assert.strictEqual(task.acceptanceCriteria.length, 2);
    assert.strictEqual(task.logs.length, 1);
    assert.ok(task.id.startsWith('task_'));
  });

  it('rejects invalid or empty task payload', () => {
    const emptyRes = createTaskEntity({});
    assert.strictEqual(emptyRes.success, false);
    assert.strictEqual(emptyRes.errorCode, ErrorCodes.TASK_INVALID_PAYLOAD_002);

    const nullRes = createTaskEntity(null);
    assert.strictEqual(nullRes.success, false);
  });

  it('enforces state machine transition rules', () => {
    // Valid: todo -> in_progress
    const validRes = validateTransition(TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS);
    assert.strictEqual(validRes.success, true);

    // Invalid: todo -> completed directly
    const invalidRes = validateTransition(TASK_STATUS.TODO, TASK_STATUS.COMPLETED);
    assert.strictEqual(invalidRes.success, false);
    assert.strictEqual(invalidRes.errorCode, ErrorCodes.TASK_INVALID_STATE_TRANSITION_004);

    // Terminal: completed -> in_progress invalid
    const terminalRes = validateTransition(TASK_STATUS.COMPLETED, TASK_STATUS.IN_PROGRESS);
    assert.strictEqual(terminalRes.success, false);
  });
});

describe('Task Control Plane - Agent Org Roster', () => {
  it('initializes with default multi-AI preset roster', () => {
    const roster = new AgentRoster();
    const agents = roster.listAgents();
    assert.ok(agents.length >= 5);

    const claude = roster.getAgent('agent-claude');
    assert.strictEqual(claude.success, true);
    assert.strictEqual(claude.data.platform, 'claude');
    assert.ok(claude.data.skills.includes('architecture'));
  });

  it('registers and updates custom agent profiles', () => {
    const roster = new AgentRoster();
    const regRes = roster.registerAgent({
      id: 'agent-custom-qa',
      name: 'Custom Playwright Tester',
      role: 'E2E QA Specialist',
      platform: 'local-model',
      skills: ['e2e', 'playwright', 'testing'],
    });

    assert.strictEqual(regRes.success, true);
    const fetched = roster.getAgent('agent-custom-qa');
    assert.strictEqual(fetched.data.name, 'Custom Playwright Tester');

    // Update status
    roster.updateAgentStatus('agent-custom-qa', AGENT_STATUS.BUSY);
    assert.strictEqual(roster.getAgent('agent-custom-qa').data.status, AGENT_STATUS.BUSY);
  });

  it('finds best matching agent based on required skills and availability', () => {
    const roster = new AgentRoster();
    const match = roster.findBestAgentForSkills(['security', 'boundary-audit']);
    assert.strictEqual(match.success, true);
    assert.strictEqual(match.data.id, 'agent-grok');
  });
});

describe('Task Control Plane - Task Dispatcher & Heartbeat Lease Lock', () => {
  it('manages task lifecycle: create, claim, heartbeat renewal, and completion', () => {
    const roster = new AgentRoster();
    const dispatcher = new TaskDispatcher({ roster, defaultLeaseDurationMs: 1000 });

    const createRes = dispatcher.createTask({
      title: 'Design Database Schema',
      priority: TASK_PRIORITY.URGENT,
    });
    assert.strictEqual(createRes.success, true);
    const taskId = createRes.data.id;

    // 1. Claim task atomically
    const claimRes = dispatcher.claimTask(taskId, 'agent-claude');
    assert.strictEqual(claimRes.success, true);
    assert.strictEqual(claimRes.data.status, TASK_STATUS.IN_PROGRESS);
    assert.strictEqual(claimRes.data.lease.agentId, 'agent-claude');

    // 2. Prevent concurrent claim collision
    const collisionRes = dispatcher.claimTask(taskId, 'agent-chatgpt');
    assert.strictEqual(collisionRes.success, false);
    assert.strictEqual(collisionRes.errorCode, ErrorCodes.TASK_ALREADY_CLAIMED_003);

    // 3. Renew heartbeat
    const renewRes = dispatcher.renewHeartbeat(taskId, 'agent-claude', 5000);
    assert.strictEqual(renewRes.success, true);

    // 4. Attach artifact
    dispatcher.addArtifact(taskId, {
      name: 'schema.sql',
      type: 'text/sql',
      content: 'CREATE TABLE users (id UUID PRIMARY KEY);',
    });

    // 5. Complete task
    const compRes = dispatcher.completeTask(taskId, 'agent-claude', 'Database schema finalized');
    assert.strictEqual(compRes.success, true);
    assert.strictEqual(compRes.data.status, TASK_STATUS.COMPLETED);
    assert.strictEqual(compRes.data.lease, null);
    assert.strictEqual(compRes.data.artifacts.length, 1);
  });

  it('blocks tasks with unmet dependencies and automatically unblocks on completion', () => {
    const dispatcher = new TaskDispatcher();

    // Task 1: Setup Infrastructure
    const t1 = dispatcher.createTask({ title: 'Task 1: Setup Infrastructure' }).data;

    // Task 2: Deploy App (depends on Task 1)
    const t2 = dispatcher.createTask({
      title: 'Task 2: Deploy App',
      dependencies: [t1.id],
    }).data;

    assert.strictEqual(t2.status, TASK_STATUS.BLOCKED);

    // Cannot claim blocked task
    const claimBlocked = dispatcher.claimTask(t2.id, 'agent-chatgpt');
    assert.strictEqual(claimBlocked.success, false);
    assert.strictEqual(claimBlocked.errorCode, ErrorCodes.TASK_DEPENDENCY_UNRESOLVED_005);

    // Claim and complete Task 1
    dispatcher.claimTask(t1.id, 'agent-claude');
    dispatcher.completeTask(t1.id, 'agent-claude', 'Done');

    // Verify Task 2 is now unblocked and moved to TODO
    const updatedT2 = dispatcher.getTask(t2.id).data;
    assert.strictEqual(updatedT2.status, TASK_STATUS.TODO);

    // Now Task 2 can be claimed
    const claimUnblocked = dispatcher.claimTask(t2.id, 'agent-chatgpt');
    assert.strictEqual(claimUnblocked.success, true);
  });

  it('reclaims tasks when heartbeat lease expires', async () => {
    const dispatcher = new TaskDispatcher({ defaultLeaseDurationMs: 10 });
    const task = dispatcher.createTask({ title: 'Ephemeral Task' }).data;

    dispatcher.claimTask(task.id, 'agent-local', 10);
    assert.strictEqual(dispatcher.getTask(task.id).data.status, TASK_STATUS.IN_PROGRESS);

    // Wait 25ms for lease expiration
    await new Promise((r) => setTimeout(r, 25));

    const reclaimed = dispatcher.checkExpiredLeases();
    assert.ok(reclaimed.includes(task.id));

    const currentTask = dispatcher.getTask(task.id).data;
    assert.strictEqual(currentTask.status, TASK_STATUS.TODO);
    assert.strictEqual(currentTask.lease, null);
  });
});

describe('Task Control Plane - Human-in-the-Loop Approval Gate', () => {
  it('supports review submission, operator approval, and dependency unblocking', () => {
    const dispatcher = new TaskDispatcher();
    const task = dispatcher.createTask({
      title: 'Deploy to Production',
      requireApproval: true,
    }).data;

    dispatcher.claimTask(task.id, 'agent-claude');

    // 1. Submit for review
    const reviewRes = ApprovalGate.submitForReview(dispatcher, task.id, 'agent-claude', {
      proposal: 'Ready to tag and push v1.4.0 release artifact',
      diff: '+ deploy: prod-cluster-us-west',
    });
    assert.strictEqual(reviewRes.success, true);
    assert.strictEqual(reviewRes.data.status, TASK_STATUS.REVIEW);
    assert.strictEqual(reviewRes.data.reviewGate.status, 'pending');

    // 2. Query pending reviews
    const pending = ApprovalGate.listPendingReviews(dispatcher);
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].id, task.id);

    // 3. Operator approves
    const approveRes = ApprovalGate.decideApproval(dispatcher, task.id, {
      decision: 'approve',
      feedback: 'LGTM! Verified deployment manifest.',
      reviewer: 'lead-operator',
    });
    assert.strictEqual(approveRes.success, true);
    assert.strictEqual(approveRes.data.status, TASK_STATUS.COMPLETED);
    assert.strictEqual(approveRes.data.reviewGate.status, 'approved');
  });

  it('handles operator rejection by returning task to in_progress with feedback', () => {
    const dispatcher = new TaskDispatcher();
    const task = dispatcher.createTask({ title: 'Refactor Auth Layer' }).data;
    dispatcher.claimTask(task.id, 'agent-chatgpt');

    ApprovalGate.submitForReview(dispatcher, task.id, 'agent-chatgpt', {
      proposal: 'Draft PR for auth rewrite',
    });

    const rejectRes = ApprovalGate.decideApproval(dispatcher, task.id, {
      decision: 'reject',
      feedback: 'Missing rate-limiter test cases. Please add them before approval.',
      reviewer: 'security-auditor',
    });

    assert.strictEqual(rejectRes.success, true);
    assert.strictEqual(rejectRes.data.status, TASK_STATUS.IN_PROGRESS);
    assert.strictEqual(rejectRes.data.reviewGate.status, 'rejected');
    assert.ok(rejectRes.data.logs.some((l) => l.message.includes('Missing rate-limiter')));
  });
});

describe('Task Control Plane - Task Runner Execution Engine', () => {
  it('executes task with custom runner function and captures artifacts', async () => {
    const dispatcher = new TaskDispatcher();
    const runner = new TaskRunner(dispatcher);

    const task = dispatcher.createTask({
      title: 'Analyze Performance Profiling',
      acceptanceCriteria: ['Memory leak trace checked', 'Flamegraph generated'],
    }).data;

    const runRes = await runner.dispatchAndRun(task.id, 'agent-claude', {
      runnerFn: async (_t, _a) => {
        return {
          summary: 'Identified 2 unclosed timers',
          content: '# Performance Audit Report\nNo memory leaks detected.',
        };
      },
    });

    assert.strictEqual(runRes.success, true);
    assert.strictEqual(runRes.data.status, TASK_STATUS.COMPLETED);
    assert.strictEqual(runRes.data.artifacts.length, 1);
    assert.ok(runRes.data.artifacts[0].content.includes('Performance Audit Report'));
  });

  it('stops at review gate when task has requireApproval set to true', async () => {
    const dispatcher = new TaskDispatcher();
    const runner = new TaskRunner(dispatcher);

    const task = dispatcher.createTask({
      title: 'Execute Database Migration',
      requireApproval: true,
    }).data;

    const runRes = await runner.dispatchAndRun(task.id, 'agent-chatgpt', {
      runnerFn: async () => ({
        summary: 'Generated migration script',
        content: 'ALTER TABLE accounts ADD COLUMN tier VARCHAR(32);',
      }),
    });

    assert.strictEqual(runRes.success, true);
    assert.strictEqual(runRes.data.status, TASK_STATUS.REVIEW);
    assert.strictEqual(runRes.data.reviewGate.status, 'pending');
  });
});

describe('Task Control Plane - P0 Disk Persistence & P1 Real-time Events', () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const testStorageFile = path.join(os.tmpdir(), `nomad-tasks-test-${Date.now()}.json`);

  it('persists tasks to disk and restores state cleanly on restart', async () => {
    const dispatcher1 = new TaskDispatcher({
      storagePath: testStorageFile,
      autoPersist: true,
    });

    const t1 = dispatcher1.createTask({
      title: 'Persistent Task Alpha',
      priority: TASK_PRIORITY.URGENT,
      acceptanceCriteria: ['Must survive daemon crash'],
    }).data;

    const t2 = dispatcher1.createTask({
      title: 'Persistent Task Beta',
      dependencies: [t1.id],
    }).data;

    dispatcher1.claimTask(t1.id, 'agent-claude', 60000);
    dispatcher1.addArtifact(t1.id, {
      name: 'architecture.md',
      type: 'text/markdown',
      content: '# Architecture Spec',
    });

    // Explicitly verify saveToDisk
    const saveRes = await dispatcher1.saveToDisk();
    assert.strictEqual(saveRes.success, true);
    assert.strictEqual(fs.existsSync(testStorageFile), true);

    // 2. Create brand-new dispatcher instance (simulating daemon restart)
    const dispatcher2 = new TaskDispatcher({
      storagePath: testStorageFile,
    });
    assert.strictEqual(dispatcher2.tasks.size, 0);

    const loadRes = dispatcher2.loadFromDisk();
    assert.strictEqual(loadRes.success, true);
    assert.strictEqual(dispatcher2.tasks.size, 2);

    const restoredT1 = dispatcher2.getTask(t1.id).data;
    assert.strictEqual(restoredT1.title, 'Persistent Task Alpha');
    assert.strictEqual(restoredT1.status, TASK_STATUS.IN_PROGRESS);
    assert.strictEqual(restoredT1.assignee, 'agent-claude');
    assert.strictEqual(restoredT1.artifacts.length, 1);
    assert.strictEqual(restoredT1.artifacts[0].name, 'architecture.md');

    const restoredT2 = dispatcher2.getTask(t2.id).data;
    assert.strictEqual(restoredT2.status, TASK_STATUS.BLOCKED);

    // Clean up temporary test file
    try {
      fs.unlinkSync(testStorageFile);
    } catch {}
  });

  it('reconciles expired leases upon loading from disk', async () => {
    const expiredStorageFile = path.join(os.tmpdir(), `nomad-tasks-expired-${Date.now()}.json`);
    const dispatcher1 = new TaskDispatcher({ storagePath: expiredStorageFile });

    const task = dispatcher1.createTask({ title: 'Task with short lease' }).data;
    dispatcher1.claimTask(task.id, 'agent-local', 5); // 5ms lease
    await dispatcher1.saveToDisk();

    // Sleep 15ms so lease expires
    await new Promise((r) => setTimeout(r, 15));

    // Reload from disk
    const dispatcher2 = new TaskDispatcher({ storagePath: expiredStorageFile });
    const loadRes = dispatcher2.loadFromDisk();
    assert.strictEqual(loadRes.success, true);
    assert.strictEqual(loadRes.data.reclaimedCount, 1);

    const reloaded = dispatcher2.getTask(task.id).data;
    assert.strictEqual(reloaded.status, TASK_STATUS.TODO);
    assert.strictEqual(reloaded.lease, null);

    try {
      fs.unlinkSync(expiredStorageFile);
    } catch {}
  });

  it('emits real-time task events for SSE broadcasting on every state change', () => {
    const events = [];
    const dispatcher = new TaskDispatcher({
      onTaskEvent: (eventType, task) => {
        events.push({ eventType, taskId: task.id, status: task.status });
      },
    });

    const task = dispatcher.createTask({ title: 'Event Test Task' }).data;
    assert.ok(events.some((e) => e.eventType === 'task:created'));

    dispatcher.claimTask(task.id, 'agent-claude');
    assert.ok(events.some((e) => e.eventType === 'task:claimed'));

    ApprovalGate.submitForReview(dispatcher, task.id, 'agent-claude', { proposal: 'Ready' });
    assert.ok(events.some((e) => e.eventType === 'task:review'));

    ApprovalGate.decideApproval(dispatcher, task.id, { decision: 'approve', reviewer: 'tester' });
    assert.ok(events.some((e) => e.eventType === 'task:approved'));

    assert.ok(events.length >= 4);
  });
});
