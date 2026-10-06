process.env.NOMAD_DAEMON_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
const AUTH = { Authorization: 'Bearer ' + process.env.NOMAD_DAEMON_TOKEN };
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { NomadDaemonServer } = require('../server');

function makeRequest(port, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: payload ? {
        ...AUTH,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      } : { ...AUTH }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('Daemon Server: Pipeline & Universal Drive Sync endpoints', async () => {
  const daemon = new NomadDaemonServer({ port: 19850 });
  await daemon.start();

  try {
    // 1. POST /api/pipeline/process
    const pipeRes = await makeRequest(19850, '/api/pipeline/process', 'POST', {
      prompt: '你好！我是AI。\n\n請編寫一個 TypeScript 排序演算法。'
    });
    assert.strictEqual(pipeRes.status, 200);
    assert.strictEqual(pipeRes.data.success, true);
    assert.strictEqual(pipeRes.data.data.laya.intent, 'code');
    assert.strictEqual(pipeRes.data.data.headroom.savedTokens > 0, true);

    // 2. GET /api/pipeline/status
    const statusRes = await makeRequest(19850, '/api/pipeline/status', 'GET');
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.data.success, true);
    assert.strictEqual(statusRes.data.data.totalProcessed, 1);

    // 3. GET /api/sync/drive/status
    const driveRes = await makeRequest(19850, '/api/sync/drive/status', 'GET');
    assert.strictEqual(driveRes.status, 200);
    assert.strictEqual(driveRes.data.success, true);
    assert.ok(driveRes.data.data.status === 'connected' || driveRes.data.data.status === 'not_found');

  } finally {
    await daemon.stop();
  }
});
