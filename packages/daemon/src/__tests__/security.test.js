process.env.NOMAD_DAEMON_TOKEN = 'test-token-0123456789abcdef0123456789abcdef';
const AUTH = { Authorization: 'Bearer ' + process.env.NOMAD_DAEMON_TOKEN };
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { NomadDaemonServer } = require('../server');

function rawRequest(port, { method = 'GET', path = '/', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('Daemon Security: rejects unauthenticated, cross-origin and rebinding requests', async () => {
  const port = 19780;
  const daemon = new NomadDaemonServer({ port });
  await daemon.start();

  try {
    // No token -> 401, and no CORS grant for random origins
    const noToken = await rawRequest(port, { method: 'POST', path: '/api/tasks', body: { title: 'x' } });
    assert.equal(noToken.status, 401);

    const wrongToken = await rawRequest(port, { path: '/api/tasks', headers: { Authorization: 'Bearer nope' } });
    assert.equal(wrongToken.status, 401);

    // Valid token from a foreign website origin -> 403, never reflected
    const evil = await rawRequest(port, {
      path: '/api/tasks',
      headers: { ...AUTH, Origin: 'https://evil.example.com' }
    });
    assert.equal(evil.status, 403);
    assert.equal(evil.headers['access-control-allow-origin'], undefined);

    // DNS rebinding: Host header of an attacker domain -> 403, even on public routes
    const rebind = await rawRequest(port, { path: '/dashboard', headers: { Host: 'attacker.example:' + port } });
    assert.equal(rebind.status, 403);

    // Preflight from a foreign origin is refused; from loopback it is granted
    const evilPreflight = await rawRequest(port, {
      method: 'OPTIONS',
      path: '/api/mcp/call',
      headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' }
    });
    assert.equal(evilPreflight.status, 403);

    const goodPreflight = await rawRequest(port, {
      method: 'OPTIONS',
      path: '/api/mcp/call',
      headers: { Origin: 'http://127.0.0.1:' + port, 'Access-Control-Request-Method': 'POST' }
    });
    assert.equal(goodPreflight.status, 204);
    assert.equal(goodPreflight.headers['access-control-allow-origin'], 'http://127.0.0.1:' + port);
    assert.match(goodPreflight.headers['access-control-allow-headers'], /Authorization/);

    // Authorized loopback request succeeds and reflects origin
    const ok = await rawRequest(port, { path: '/api/tasks', headers: { ...AUTH, Origin: 'http://localhost:' + port } });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:' + port);

    // SSE accepts the query-string token (EventSource cannot send headers)
    const sse = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1', port, method: 'GET',
        path: '/api/events?token=' + process.env.NOMAD_DAEMON_TOKEN
      }, (res) => { resolve(res.statusCode); req.destroy(); });
      req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
      req.end();
    });
    assert.equal(sse, 200);

    // Public health probe stays open without a token
    const probe = await rawRequest(port, { path: '/api/probe?timeout=100' });
    assert.equal(probe.status, 200);

    // Dashboard ships with the token shim so its own fetches authenticate
    const dash = await rawRequest(port, { path: '/dashboard' });
    assert.equal(dash.status, 200);
    assert.ok(dash.body.includes('window.__NOMAD_TOKEN__'));
  } finally {
    await daemon.stop();
  }
});

test('Daemon Security: local-model endpoints refuse non-loopback targets (SSRF)', async () => {
  const port = 19781;
  const daemon = new NomadDaemonServer({ port });
  await daemon.start();

  try {
    const probe = await rawRequest(port, { path: '/api/local-model/probe?host=169.254.169.254&port=80', headers: AUTH });
    assert.equal(probe.status, 400);

    const chatHost = await rawRequest(port, { method: 'POST', path: '/api/local-model/chat', headers: AUTH, body: { host: '10.0.0.1', prompt: 'hi' } });
    assert.equal(chatHost.status, 400);

    const chatEndpoint = await rawRequest(port, { method: 'POST', path: '/api/local-model/chat', headers: AUTH, body: { endpoint: 'http://example.com/v1', prompt: 'hi' } });
    assert.equal(chatEndpoint.status, 400);
  } finally {
    await daemon.stop();
  }
});
