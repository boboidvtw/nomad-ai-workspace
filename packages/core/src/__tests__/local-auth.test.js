const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  resolveAuthToken,
  isAllowedHostHeader,
  isAllowedOrigin,
  isLoopbackModelTarget,
  authorizeRequest,
  injectDashboardAuth
} = require('../security/local-auth');

const TOKEN = 'a'.repeat(64);

function fakeReq(headers = {}) {
  return { headers };
}

test('LocalAuth: resolveAuthToken creates a 0600 token file once and reuses it', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-auth-'));
  const file = path.join(dir, 'nested', 'daemon-token');
  const prevFile = process.env.NOMAD_DAEMON_TOKEN_FILE;
  const prevToken = process.env.NOMAD_DAEMON_TOKEN;
  process.env.NOMAD_DAEMON_TOKEN_FILE = file;
  delete process.env.NOMAD_DAEMON_TOKEN;
  try {
    const first = resolveAuthToken();
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(resolveAuthToken(), first);
    assert.equal(resolveAuthToken('explicit-token'), 'explicit-token');
  } finally {
    if (prevFile === undefined) delete process.env.NOMAD_DAEMON_TOKEN_FILE;
    else process.env.NOMAD_DAEMON_TOKEN_FILE = prevFile;
    if (prevToken !== undefined) process.env.NOMAD_DAEMON_TOKEN = prevToken;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('LocalAuth: Host header guard blocks DNS rebinding hosts', () => {
  assert.equal(isAllowedHostHeader('127.0.0.1:8765'), true);
  assert.equal(isAllowedHostHeader('localhost:8765'), true);
  assert.equal(isAllowedHostHeader('[::1]:8765'), true);
  assert.equal(isAllowedHostHeader(undefined), true);
  assert.equal(isAllowedHostHeader('evil.example.com:8765'), false);
  assert.equal(isAllowedHostHeader('127.0.0.1.evil.com'), false);
  assert.equal(isAllowedHostHeader('192.168.1.5:8765', '192.168.1.5'), true);
  assert.equal(isAllowedHostHeader('evil.com:8765', '0.0.0.0'), false);
});

test('LocalAuth: only loopback http(s) origins are allowed', () => {
  assert.equal(isAllowedOrigin(undefined), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:8765'), true);
  assert.equal(isAllowedOrigin('http://localhost:3000'), true);
  assert.equal(isAllowedOrigin('https://evil.example.com'), false);
  assert.equal(isAllowedOrigin('http://localhost.evil.com'), false);
  assert.equal(isAllowedOrigin('null'), false);
  assert.equal(isAllowedOrigin('chrome-extension://abcdef'), false);
});

test('LocalAuth: local-model targets must be loopback', () => {
  assert.equal(isLoopbackModelTarget({}), true);
  assert.equal(isLoopbackModelTarget({ host: 'localhost' }), true);
  assert.equal(isLoopbackModelTarget({ endpoint: 'http://127.0.0.1:1234/v1' }), true);
  assert.equal(isLoopbackModelTarget({ host: '169.254.169.254' }), false);
  assert.equal(isLoopbackModelTarget({ endpoint: 'http://10.0.0.1/v1' }), false);
  assert.equal(isLoopbackModelTarget({ endpoint: 'file:///etc/passwd' }), false);
  assert.equal(isLoopbackModelTarget({ endpoint: 'not a url' }), false);
});

test('LocalAuth: authorizeRequest enforces token, origin and host', () => {
  const url = new URL('http://127.0.0.1:8765/api/tasks');
  const base = { host: '127.0.0.1:8765' };

  assert.equal(authorizeRequest(fakeReq(base), url, { token: TOKEN }).status, 401);
  assert.equal(authorizeRequest(fakeReq({ ...base, authorization: 'Bearer wrong' }), url, { token: TOKEN }).status, 401);
  assert.equal(authorizeRequest(fakeReq({ ...base, authorization: 'Bearer ' + TOKEN }), url, { token: TOKEN }).allowed, true);
  assert.equal(authorizeRequest(fakeReq({ ...base, 'x-nomad-token': TOKEN }), url, { token: TOKEN }).allowed, true);
  assert.equal(authorizeRequest(fakeReq(base), new URL(url + '?token=' + TOKEN), { token: TOKEN }).allowed, true);

  const evilOrigin = { ...base, origin: 'https://evil.example.com', authorization: 'Bearer ' + TOKEN };
  assert.equal(authorizeRequest(fakeReq(evilOrigin), url, { token: TOKEN }).status, 403);

  const rebinding = { host: 'attacker.example:8765', authorization: 'Bearer ' + TOKEN };
  assert.equal(authorizeRequest(fakeReq(rebinding), url, { token: TOKEN }).status, 403);
  assert.equal(authorizeRequest(fakeReq(rebinding), url, { token: TOKEN, publicRoute: true }).status, 403);

  assert.equal(authorizeRequest(fakeReq(base), url, { token: TOKEN, publicRoute: true }).allowed, true);
});

test('LocalAuth: injectDashboardAuth embeds token shim right after <head>', () => {
  const html = '<!doctype html><html><head><title>x</title></head><body></body></html>';
  const out = injectDashboardAuth(html, TOKEN, [8765]);
  assert.ok(out.indexOf('<script>') > out.indexOf('<head>'));
  assert.ok(out.indexOf('<script>') < out.indexOf('<title>'));
  assert.ok(out.includes(TOKEN));
  assert.ok(out.includes('"ports":["8765"]'));

  const hostile = injectDashboardAuth('<head></head>', '</script><script>alert(1)</script>');
  assert.ok(!hostile.includes('</script><script>alert(1)'));
});
