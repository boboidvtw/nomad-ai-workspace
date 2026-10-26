process.env.NOMAD_DAEMON_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
const AUTH = { Authorization: 'Bearer ' + process.env.NOMAD_DAEMON_TOKEN };
const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { NomadDaemonServer } = require('../server');

function makeRequest(port, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          ...AUTH,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody);
            resolve({ status: res.statusCode, data: parsed });
          } catch {
            resolve({ status: res.statusCode, text: responseBody });
          }
        });
      },
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('Daemon Server: Task Control Plane REST Endpoints', () => {
  it('manages agents and tasks end-to-end via REST APIs', async () => {
    const TEST_PORT = 19910;
    const server = new NomadDaemonServer({ port: TEST_PORT });
    await server.start();

    try {
      // 1. GET /api/roster
      const rosterRes = await makeRequest(TEST_PORT, 'GET', '/api/roster');
      assert.strictEqual(rosterRes.status, 200);
      assert.ok(Array.isArray(rosterRes.data.data));
      assert.ok(rosterRes.data.data.some((a) => a.id === 'agent-claude'));

      // 2. POST /api/tasks (Create task)
      const createTaskRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks', {
        title: 'REST Endpoint Verification Task',
        description: 'Verify all REST task endpoints',
        priority: 'high',
        acceptanceCriteria: ['All status codes 200', 'State transitions verified'],
      });
      assert.strictEqual(createTaskRes.status, 200);
      assert.strictEqual(createTaskRes.data.success, true);
      const taskId = createTaskRes.data.data.id;
      assert.ok(taskId);

      // 3. GET /api/tasks/detail?id=...
      const detailRes = await makeRequest(TEST_PORT, 'GET', `/api/tasks/detail?id=${taskId}`);
      assert.strictEqual(detailRes.status, 200);
      assert.strictEqual(detailRes.data.data.title, 'REST Endpoint Verification Task');

      // 4. POST /api/tasks/claim
      const claimRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/claim', {
        taskId,
        agentId: 'agent-claude',
        leaseDurationMs: 60000,
      });
      assert.strictEqual(claimRes.status, 200);
      assert.strictEqual(claimRes.data.data.status, 'in_progress');
      assert.strictEqual(claimRes.data.data.assignee, 'agent-claude');

      // 5. POST /api/tasks/heartbeat
      const hbRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/heartbeat', {
        taskId,
        agentId: 'agent-claude',
        extendMs: 30000,
      });
      assert.strictEqual(hbRes.status, 200);
      assert.strictEqual(hbRes.data.success, true);

      // 6. POST /api/tasks/review (Submit for review)
      const reviewRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/review', {
        taskId,
        agentId: 'agent-claude',
        proposal: 'All verification tests pass. Ready for sign-off.',
      });
      assert.strictEqual(reviewRes.status, 200);
      assert.strictEqual(reviewRes.data.data.status, 'review');

      // 7. POST /api/tasks/approval (Approve)
      const approveRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/approval', {
        taskId,
        decision: 'approve',
        feedback: 'Excellent work!',
        reviewer: 'human-admin',
      });
      assert.strictEqual(approveRes.status, 200);
      assert.strictEqual(approveRes.data.data.status, 'completed');

      // 8. GET /api/tasks?status=completed
      const listRes = await makeRequest(TEST_PORT, 'GET', '/api/tasks?status=completed');
      assert.strictEqual(listRes.status, 200);
      assert.ok(listRes.data.data.some((t) => t.id === taskId));

      // 9. POST /api/tasks/run (Automated execution)
      const autoTask = (
        await makeRequest(TEST_PORT, 'POST', '/api/tasks', {
          title: 'Auto Run Task',
        })
      ).data.data;

      const runRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/run', {
        taskId: autoTask.id,
        agentId: 'agent-chatgpt',
      });
      assert.strictEqual(runRes.status, 200);
      assert.strictEqual(runRes.data.data.status, 'completed');
    } finally {
      await server.stop();
    }
  });
});

it('supports DAG graph, search query and recurring schedules via REST APIs', async () => {
  const TEST_PORT = 19920;
  const server = new NomadDaemonServer({ port: TEST_PORT });
  await server.start();

  try {
    // 1. Create linked tasks
    const t1 = (await makeRequest(TEST_PORT, 'POST', '/api/tasks', { title: 'Database Migration' }))
      .data.data;
    const t2 = (
      await makeRequest(TEST_PORT, 'POST', '/api/tasks', {
        title: 'API Gateway Endpoint',
        dependencies: [t1.id],
      })
    ).data.data;

    // 2. GET /api/tasks/graph
    const graphRes = await makeRequest(TEST_PORT, 'GET', '/api/tasks/graph');
    assert.strictEqual(graphRes.status, 200);
    assert.ok(graphRes.data.data.nodes.length >= 2);
    const node2 = graphRes.data.data.nodes.find((n) => n.id === t2.id);
    assert.strictEqual(node2.isBlocked, true);

    // 3. GET /api/tasks?query=Gateway
    const searchRes = await makeRequest(TEST_PORT, 'GET', '/api/tasks?query=Gateway');
    assert.strictEqual(searchRes.status, 200);
    assert.ok(searchRes.data.data.some((t) => t.id === t2.id));

    // 4. GET /api/tasks/schedule
    const schedList = await makeRequest(TEST_PORT, 'GET', '/api/tasks/schedule');
    assert.strictEqual(schedList.status, 200);
    assert.ok(Array.isArray(schedList.data.data));
    assert.ok(schedList.data.data.length >= 2);

    // 5. POST /api/tasks/schedule/trigger
    const trigRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/schedule/trigger', {
      id: 'schedule-sys-health',
    });
    assert.strictEqual(trigRes.status, 200);
    assert.strictEqual(trigRes.data.success, true);
    assert.ok(trigRes.data.data.task.id);
  } finally {
    await server.stop();
  }
});

it('broadcasts real-time SSE events over /api/events on task lifecycle changes', async () => {
  const TEST_PORT = 19915;
  const server = new NomadDaemonServer({ port: TEST_PORT });
  await server.start();

  const receivedEvents = [];
  let sseReq = null;

  try {
    // 1. Establish SSE Connection
    await new Promise((resolve) => {
      sseReq = http.request(
        {
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path: '/api/events',
          method: 'GET',
          headers: AUTH,
        },
        (res) => {
          res.on('data', (chunk) => {
            const text = chunk.toString();
            receivedEvents.push(text);
            if (text.includes('event: connected')) {
              resolve();
            }
          });
        },
      );
      sseReq.end();
    });

    // 2. Trigger task creation
    const createRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks', {
      title: 'SSE Broadcast Test Task',
    });
    assert.strictEqual(createRes.status, 200);
    const taskId = createRes.data.data.id;

    // Small tick for event delivery
    await new Promise((r) => setTimeout(r, 20));

    const hasCreatedEvent = receivedEvents.some(
      (raw) => raw.includes('event: task:created') && raw.includes(taskId),
    );
    assert.strictEqual(hasCreatedEvent, true, 'SSE stream should receive task:created event');

    // 3. Trigger claim
    await makeRequest(TEST_PORT, 'POST', '/api/tasks/claim', {
      taskId,
      agentId: 'agent-claude',
    });

    await new Promise((r) => setTimeout(r, 20));

    const hasClaimedEvent = receivedEvents.some(
      (raw) => raw.includes('event: task:claimed') && raw.includes(taskId),
    );
    assert.strictEqual(hasClaimedEvent, true, 'SSE stream should receive task:claimed event');
  } finally {
    if (sseReq) {
      try {
        sseReq.destroy();
      } catch {}
    }
    await server.stop();
  }
});

it('supports Agensh decentralized self-claiming, P2P contract locks, and shared context via REST APIs', async () => {
  const TEST_PORT = 19925;
  const server = new NomadDaemonServer({ port: TEST_PORT });
  await server.start();

  try {
    // 1. Create a task with requiredSkills and estimatedTokens
    const createRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks', {
      title: 'Agensh Self-Claimable Task',
      priority: 'urgent',
      metadata: {
        requiredSkills: ['architecture'],
        estimatedTokens: 12000,
      },
    });
    assert.strictEqual(createRes.status, 200);
    const createdTaskId = createRes.data.data.id;

    // 2. Self-claim via POST /api/tasks/claim without taskId
    const selfClaimRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/claim', {
      agentId: 'agent-claude',
      skills: ['architecture'],
      remainingTokenBudget: 28000,
    });
    assert.strictEqual(selfClaimRes.status, 200);
    assert.strictEqual(selfClaimRes.data.success, true);
    assert.strictEqual(selfClaimRes.data.data.id, createdTaskId);
    assert.strictEqual(selfClaimRes.data.data.assignee, 'agent-claude');

    // 3. Send P2P message with [CONTRACT_LOCKED]
    const p2pRes = await makeRequest(TEST_PORT, 'POST', '/api/agensh/p2p/message', {
      fromAgentId: 'agent-claude',
      toAgentId: 'agent-chatgpt',
      taskId: createdTaskId,
      content: '[CONTRACT_LOCKED] packages/core/src/result.js: ok(data) => UnitSuccess<T>',
    });
    assert.strictEqual(p2pRes.status, 200);
    assert.strictEqual(p2pRes.data.data.contractLocked, true);

    // 4. Broadcast a failure immunization & publish a finding
    const failRes = await makeRequest(TEST_PORT, 'POST', '/api/agensh/context/failures', {
      agentId: 'agent-grok',
      taskId: createdTaskId,
      domain: 'daemon',
      errorCode: 'DAEMON_SERVER_PORT_IN_USE_001',
      symptom: 'Port collision during parallel test execution',
      mitigation: 'Assign distinct ephemeral ports per test worker',
      distillToExperienceDb: false,
    });
    assert.strictEqual(failRes.status, 200);

    const findRes = await makeRequest(TEST_PORT, 'POST', '/api/agensh/context/findings', {
      agentId: 'agent-gemini',
      taskId: createdTaskId,
      domain: 'daemon',
      title: 'SSE Broadcast Pattern',
      content: 'Use server.broadcast(eventType, payload) for all Agensh events.',
    });
    assert.strictEqual(findRes.status, 200);

    // 5. Gather context with token budget cap
    const gatherRes = await makeRequest(
      TEST_PORT,
      'GET',
      '/api/agensh/context/gather?domain=daemon&maxTokenBudget=1500',
    );
    assert.strictEqual(gatherRes.status, 200);
    assert.strictEqual(gatherRes.data.data.immunizations.length, 1);
    assert.strictEqual(gatherRes.data.data.findings.length, 1);
    assert.strictEqual(gatherRes.data.data.contracts.length, 1);

    // 6. Verify /api/agensh/status telemetry
    const statusRes = await makeRequest(TEST_PORT, 'GET', '/api/agensh/status');
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.data.data.contracts.length, 1);
    assert.strictEqual(statusRes.data.data.immunizations.length, 1);
  } finally {
    await server.stop();
  }
});
