const { describe, it } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { LocalSyncBridge } = require('../bridge');

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

describe('Bridge: Task Control Plane & Multi-Agent Dispatcher', () => {
  it('allows creating, claiming, reviewing, and completing tasks through Local Sync Bridge', async () => {
    const TEST_PORT = 19935;
    const bridge = new LocalSyncBridge({
      port: TEST_PORT,
      onDispatchPrompt: async (platform, prompt) => ({ text: `Mock dispatched to ${platform}` }),
    });
    await bridge.start();

    try {
      // 1. GET /api/roster
      const rosterRes = await makeRequest(TEST_PORT, 'GET', '/api/roster');
      assert.strictEqual(rosterRes.status, 200);
      assert.ok(rosterRes.data.data.length >= 5);

      // 2. POST /api/tasks
      const createRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks', {
        title: 'Bridge Task Management Integration',
        priority: 'urgent',
        acceptanceCriteria: ['Desktop bridge communicates with core dispatcher']
      });
      assert.strictEqual(createRes.status, 200);
      assert.strictEqual(createRes.data.success, true);
      const taskId = createRes.data.data.id;

      // 3. POST /api/tasks/claim
      const claimRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/claim', {
        taskId,
        agentId: 'agent-claude',
        leaseDurationMs: 45000
      });
      assert.strictEqual(claimRes.status, 200);
      assert.strictEqual(claimRes.data.data.assignee, 'agent-claude');

      // 4. POST /api/tasks/complete
      const compRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/complete', {
        taskId,
        agentId: 'agent-claude',
        summary: 'Bridge task verified successfully'
      });
      assert.strictEqual(compRes.status, 200);
      assert.strictEqual(compRes.data.data.status, 'completed');

      // 5. Automated run on a new task
      const autoTask = (await makeRequest(TEST_PORT, 'POST', '/api/tasks', {
        title: 'Automated Runner Task',
        requireApproval: false,
      })).data.data;

      const runRes = await makeRequest(TEST_PORT, 'POST', '/api/tasks/run', {
        taskId: autoTask.id,
        agentId: 'agent-chatgpt'
      });
      assert.strictEqual(runRes.status, 200);
      assert.strictEqual(runRes.data.data.status, 'completed');
    } finally {
      await bridge.stop();
    }
  });
});
