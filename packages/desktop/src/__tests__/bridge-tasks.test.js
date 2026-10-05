const { describe, it } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { LocalSyncBridge } = require("../bridge");

function makeRequest(port, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let responseBody = "";
      res.on("data", chunk => { responseBody += chunk; });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(responseBody);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, text: responseBody });
        }
      });
    });

    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

describe("Bridge: Task Control Plane & Multi-Agent Dispatcher", () => {
  it("allows creating, claiming, reviewing, and completing tasks through Local Sync Bridge", async () => {
    const bridge = new LocalSyncBridge({
      port: 19950,
      onDispatchPrompt: async (platform, prompt) => ({ text: `Mock dispatched to ${platform}` }),
    });
    await bridge.start();
    const actualPort = bridge.port;

    try {
      // 1. GET /api/roster
      const rosterRes = await makeRequest(actualPort, "GET", "/api/roster");
      assert.strictEqual(rosterRes.status, 200);
      assert.ok(rosterRes.data.data.length >= 5);

      // 2. POST /api/tasks
      const createRes = await makeRequest(actualPort, "POST", "/api/tasks", {
        title: "Bridge Task Management Integration",
        priority: "urgent",
        acceptanceCriteria: ["Desktop bridge communicates with core dispatcher"]
      });
      assert.strictEqual(createRes.status, 200);
      assert.strictEqual(createRes.data.success, true);
      const taskId = createRes.data.data.id;

      // 3. POST /api/tasks/claim
      const claimRes = await makeRequest(actualPort, "POST", "/api/tasks/claim", {
        taskId,
        agentId: "agent-claude",
        leaseDurationMs: 45000
      });
      assert.strictEqual(claimRes.status, 200);
      assert.strictEqual(claimRes.data.data.assignee, "agent-claude");

      // 4. POST /api/tasks/complete
      const compRes = await makeRequest(actualPort, "POST", "/api/tasks/complete", {
        taskId,
        agentId: "agent-claude",
        summary: "Bridge task verified successfully"
      });
      assert.strictEqual(compRes.status, 200);
      assert.strictEqual(compRes.data.data.status, "completed");

      // 5. Automated run on a new task
      const autoTask = (await makeRequest(actualPort, "POST", "/api/tasks", {
        title: "Automated Runner Task",
        requireApproval: false,
      })).data.data;

      const runRes = await makeRequest(actualPort, "POST", "/api/tasks/run", {
        taskId: autoTask.id,
        agentId: "agent-chatgpt"
      });
      assert.strictEqual(runRes.status, 200);
      assert.strictEqual(runRes.data.data.status, "completed");
    } finally {
      await bridge.stop();
    }
  });


  it("serves task graph and recurring schedule endpoints through Local Sync Bridge", async () => {
    const bridge = new LocalSyncBridge({ port: 19970 });
    await bridge.start();
    const actualPort = bridge.port;

    try {
      // 1. GET /api/tasks/graph
      const graphRes = await makeRequest(actualPort, "GET", "/api/tasks/graph");
      assert.strictEqual(graphRes.status, 200);
      assert.ok(Array.isArray(graphRes.data.data.nodes));

      // 2. GET /api/tasks/schedule
      const schedRes = await makeRequest(actualPort, "GET", "/api/tasks/schedule");
      assert.strictEqual(schedRes.status, 200);
      assert.ok(schedRes.data.data.length >= 2);

      // 3. POST /api/tasks/schedule/trigger
      const trigRes = await makeRequest(actualPort, "POST", "/api/tasks/schedule/trigger", { id: "schedule-sys-health" });
      assert.strictEqual(trigRes.status, 200);
      assert.strictEqual(trigRes.data.success, true);
    } finally {
      await bridge.stop();
    }
  });

  it("broadcasts real-time SSE events over /api/events on desktop bridge", async () => {
    const bridge = new LocalSyncBridge({ port: 19960 });
    await bridge.start();
    const actualPort = bridge.port;

    const receivedEvents = [];
    let sseReq = null;

    try {
      await new Promise((resolve) => {
        sseReq = http.request({
          hostname: "127.0.0.1",
          port: actualPort,
          path: "/api/events",
          method: "GET"
        }, (res) => {
          res.on("data", chunk => {
            const text = chunk.toString();
            receivedEvents.push(text);
            if (text.includes("event: connected")) {
              resolve();
            }
          });
        });
        sseReq.end();
      });

      const createRes = await makeRequest(actualPort, "POST", "/api/tasks", {
        title: "Bridge SSE Task Event"
      });
      assert.strictEqual(createRes.status, 200);
      const taskId = createRes.data.data.id;

      await new Promise(r => setTimeout(r, 50));

      const hasEvent = receivedEvents.some(raw => raw.includes("event: task:created") && raw.includes(taskId));
      assert.strictEqual(hasEvent, true, "Bridge SSE stream should receive task:created");
    } finally {
      if (sseReq) {
        try { sseReq.destroy(); } catch {}
      }
      await bridge.stop();
    }
  });
});
