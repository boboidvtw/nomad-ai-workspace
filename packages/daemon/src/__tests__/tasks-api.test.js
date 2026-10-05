const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { NomadDaemonServer } = require('../server');

function makeRequest(port, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, text: responseBody });
        }
      });
    });

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
      assert.ok(rosterRes.data.data.some(a => a.id === 'agent-claude'));

      // 2. POST /api/tasks (Create task)
      const createTaskRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks', {
        title: 'REST Endpoint Verification Task',
        description: 'Verify all REST task endpoints',
        priority: 'high',
        acceptanceCriteria: ['All status codes 200', 'State transitions verified']
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
        leaseDurationMs: 60000
      });
      assert.strictEqual(claimRes.status, 200);
      assert.strictEqual(claimRes.data.data.status, 'in_progress');
      assert.strictEqual(claimRes.data.data.assignee, 'agent-claude');

      // 5. POST /api/tasks/heartbeat
      const hbRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/heartbeat', {
        taskId,
        agentId: 'agent-claude',
        extendMs: 30000
      });
      assert.strictEqual(hbRes.status, 200);
      assert.strictEqual(hbRes.data.success, true);

      // 6. POST /api/tasks/review (Submit for review)
      const reviewRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/review', {
        taskId,
        agentId: 'agent-claude',
        proposal: 'All verification tests pass. Ready for sign-off.'
      });
      assert.strictEqual(reviewRes.status, 200);
      assert.strictEqual(reviewRes.data.data.status, 'review');

      // 7. POST /api/tasks/approval (Approve)
      const approveRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/approval', {
        taskId,
        decision: 'approve',
        feedback: 'Excellent work!',
        reviewer: 'human-admin'
      });
      assert.strictEqual(approveRes.status, 200);
      assert.strictEqual(approveRes.data.data.status, 'completed');

      // 8. GET /api/tasks?status=completed
      const listRes = await makeRequest(TEST_PORT, 'GET', '/api/tasks?status=completed');
      assert.strictEqual(listRes.status, 200);
      assert.ok(listRes.data.data.some(t => t.id === taskId));

      // 9. POST /api/tasks/run (Automated execution)
      const autoTask = (await makeRequest(TEST_PORT, 'POST', '/api/tasks', {
        title: 'Auto Run Task'
      })).data.data;

      const runRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/run', {
        taskId: autoTask.id,
        agentId: 'agent-chatgpt'
      });
      assert.strictEqual(runRes.status, 200);
      assert.strictEqual(runRes.data.data.status, 'completed');
    } finally {
      await server.stop();
    }
  });
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
        sseReq = http.request({
          hostname: '127.0.0.1',
          port: TEST_PORT,
          path: '/api/events',
          method: 'GET'
        }, (res) => {
          res.on('data', chunk => {
            const text = chunk.toString();
            receivedEvents.push(text);
            if (text.includes('event: connected')) {
              resolve();
            }
          });
        });
        sseReq.end();
      });

      // 2. Trigger task creation
      const createRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks', {
        title: 'SSE Broadcast Test Task'
      });
      assert.strictEqual(createRes.status, 200);
      const taskId = createRes.data.data.id;

      // Small tick for event delivery
      await new Promise(r => setTimeout(r, 20));

      const hasCreatedEvent = receivedEvents.some(raw => raw.includes('event: task:created') && raw.includes(taskId));
      assert.strictEqual(hasCreatedEvent, true, 'SSE stream should receive task:created event');

      // 3. Trigger claim
      await makeRequest(TEST_PORT, 'POST', '/api/tasks/claim', {
        taskId,
        agentId: 'agent-claude'
      });

      await new Promise(r => setTimeout(r, 20));

      const hasClaimedEvent = receivedEvents.some(raw => raw.includes('event: task:claimed') && raw.includes(taskId));
      assert.strictEqual(hasClaimedEvent, true, 'SSE stream should receive task:claimed event');
    } finally {
      if (sseReq) {
        try { sseReq.destroy(); } catch {}
      }
      await server.stop();
    }
  });
