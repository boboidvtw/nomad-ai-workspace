process.env.NOMAD_DAEMON_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
const AUTH = { Authorization: 'Bearer ' + process.env.NOMAD_DAEMON_TOKEN };
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  NomadDaemonServer,
  probePort,
  probeAllServices,
  findDashboardPath,
  readPid,
  writePid,
  removePid,
} = require('../../index');

test('Daemon Prober: probePort detects closed port cleanly without throwing', async () => {
  const res = await probePort('127.0.0.1', 49999, 150);
  assert.equal(res.online, false);
  assert.ok(res.latencyMs >= 0);
});

test('Daemon Prober: probeAllServices returns structured result with summary', async () => {
  const res = await probeAllServices(undefined, 100);
  assert.equal(res.success, true);
  assert.ok(Array.isArray(res.data.services));
  assert.ok(res.data.summary.total > 0);
});

test('Daemon Static: findDashboardPath locates valid index.html', () => {
  const p = findDashboardPath();
  assert.ok(p, 'Dashboard path must not be null');
  assert.ok(p.endsWith('index.html'));
});

test('Daemon ProcessManager: writePid, readPid and removePid manage PID lifecycle', () => {
  writePid(99999);
  assert.equal(readPid(), 99999);
  removePid();
  assert.equal(readPid(), null);
});

test('Daemon Server: Starts on test port, serves /dashboard and /api/probe, then stops', async () => {
  const testPort = 19765;
  const server = new NomadDaemonServer({ port: testPort });

  const startRes = await server.start();
  assert.equal(startRes.success, true);

  // Test /dashboard
  const dashRes = await fetch('http://127.0.0.1:' + testPort + '/dashboard', { headers: AUTH });
  assert.equal(dashRes.status, 200);
  const html = await dashRes.text();
  assert.ok(html.includes('Nomad Dashboard'));

  // Test /api/probe
  const probeRes = await fetch('http://127.0.0.1:' + testPort + '/api/probe', { headers: AUTH });
  assert.equal(probeRes.status, 200);
  const probeJson = await probeRes.json();
  assert.equal(probeJson.success, true);
  assert.ok(probeJson.data.services.length > 0);

  // Test /api/status
  const statusRes = await fetch('http://127.0.0.1:' + testPort + '/api/status', { headers: AUTH });
  assert.equal(statusRes.status, 200);
  const statusJson = await statusRes.json();
  assert.equal(statusJson.success, true);
  assert.equal(statusJson.data.daemon.name, 'Nomad Core Daemon');

  const stopRes = await server.stop();
  assert.equal(stopRes.success, true);
});
