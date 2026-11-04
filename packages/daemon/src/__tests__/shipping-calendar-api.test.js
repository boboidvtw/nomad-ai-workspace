process.env.NOMAD_DAEMON_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
const AUTH = { Authorization: 'Bearer ' + process.env.NOMAD_DAEMON_TOKEN };
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { RecurringScheduler, ShippingLedger } = require('@nomad/core');
const { NomadDaemonServer } = require('../server');

/**
 * @param {number} port
 * @param {string} method
 * @param {string} urlPath
 * @param {unknown} [body]
 * @returns {Promise<{ status: number | undefined, data: any }>}
 */
function request(port, method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
          ...AUTH,
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text) }));
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

describe('Daemon: /api/calendar and /api/shipping', () => {
  it('passes a shipping square through the task review gate and shows the readback on the calendar', async () => {
    const PORT = 19940;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-ship-api-'));
    const scheduler = new RecurringScheduler({
      storagePath: path.join(dir, 'recurring.json'),
      autoPersist: false,
    });
    scheduler.schedules.clear();
    const shipping = new ShippingLedger({ storagePath: path.join(dir, 'shipping.json') });
    const server = new NomadDaemonServer({
      port: PORT,
      tasksPath: path.join(dir, 'tasks.json'),
      scheduler,
      shipping,
    });
    await server.start();
    /** @param {string} method @param {string} p @param {unknown} [b] */
    const api = (method, p, b) => request(PORT, method, p, b);
    try {
      // A feature built by agent-claude, verified by the operator.
      const created = await api('POST', '/api/shipping', {
        title: 'Calendar view',
        problem: 'No overview of when routines run',
        outcome: 'Month grid of planned and past runs',
        contract: 'GET /api/calendar + Dashboard panel',
        builders: ['agent-claude'],
      });
      assert.strictEqual(created.status, 200);
      const id = created.data.data.id;
      await api('POST', `/api/shipping/${id}/advance`, {});
      const inv = await api('POST', `/api/shipping/${id}/invariants`, {
        text: 'Local day buckets',
      });
      const invId = inv.data.data.invariants[0].id;
      for (const kind of ['user-path', 'trace', 'release-note']) {
        const res = await api('POST', `/api/shipping/${id}/squares`, {
          title: `${kind} proof`,
          kind,
          covers: [invId],
          owner: 'operator',
        });
        assert.strictEqual(res.status, 200);
      }
      await api('POST', `/api/shipping/${id}/advance`, {});
      const verifying = await api('POST', `/api/shipping/${id}/advance`, {});
      assert.strictEqual(verifying.data.data.state, 'verifying');
      const squares = verifying.data.data.squares;

      // The user-path square is settled by approving a task through the review gate.
      const task = await api('POST', '/api/tasks', { title: 'Click through the calendar' });
      const taskId = task.data.data.id;
      await api('POST', `/api/shipping/${id}/squares/${squares[0].id}/link`, { taskId });
      await api('POST', '/api/tasks/claim', { taskId, agentId: 'agent-claude' });
      await api('POST', '/api/tasks/review', {
        taskId,
        agentId: 'agent-claude',
        proposal: 'Month grid renders',
      });
      const approved = await api('POST', '/api/tasks/approval', {
        taskId,
        decision: 'approve',
        reviewer: 'operator',
        feedback: 'checked in Studio',
      });
      assert.strictEqual(approved.status, 200);
      const afterReview = await api('GET', `/api/shipping/${id}`);
      assert.strictEqual(afterReview.data.data.squares[0].status, 'passed');
      assert.match(afterReview.data.data.squares[0].evidence, /checked in Studio/);

      // A builder cannot pass the remaining squares; the operator can.
      const selfPass = await api('POST', `/api/shipping/${id}/squares/${squares[1].id}`, {
        status: 'passed',
        evidence: 'mine',
        actor: 'agent-claude',
      });
      assert.strictEqual(selfPass.status, 409);
      for (const square of squares.slice(1)) {
        const res = await api('POST', `/api/shipping/${id}/squares/${square.id}`, {
          status: 'passed',
          evidence: `checked ${square.kind}`,
        });
        assert.strictEqual(res.status, 200);
      }
      assert.strictEqual(
        (await api('POST', `/api/shipping/${id}/advance`, {})).data.data.state,
        'ready',
      );
      await api('POST', `/api/shipping/${id}/release`, {
        notes: 'Calendar tab',
        rollbackPlan: 'Reinstall backup',
        baseline: 'No calendar today',
        approvedBy: 'operator',
      });
      await api('POST', `/api/shipping/${id}/advance`, {});
      const watching = await api('POST', `/api/shipping/${id}/smoke`, {
        status: 'passed',
        evidence: 'Studio shows the month',
      });
      assert.strictEqual(watching.data.data.state, 'watching');
      const dueAt = watching.data.data.readback.dueAt;

      // The readback due date shows on the calendar next to a planned routine.
      await api('POST', '/api/tasks/schedule', {
        name: 'Hourly probe',
        intervalMs: 3600000,
        taskTemplate: { title: 'probe', assignee: 'agent-local' },
        enabled: true,
      });
      const from = new Date(Date.parse(dueAt) - 24 * 3600000).toISOString();
      const to = new Date(Date.parse(dueAt) + 24 * 3600000).toISOString();
      const cal = await api('GET', `/api/calendar?from=${from}&to=${to}&tz=0`);
      assert.strictEqual(cal.status, 200);
      const items = cal.data.data.days.flatMap((/** @type {any} */ d) => d.items);
      assert.ok(items.some((/** @type {any} */ i) => i.kind === 'readback' && i.featureId === id));
      assert.ok(
        items.some((/** @type {any} */ i) => i.kind === 'planned' && i.title === 'Hourly probe'),
      );
      assert.strictEqual((await api('GET', '/api/calendar?from=x&to=y')).status, 400);
    } finally {
      await server.stop();
    }
  });
});
