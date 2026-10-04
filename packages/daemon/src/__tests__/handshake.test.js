const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { NomadDaemonServer } = require('../server');
const { ErrorCodes } = require('@nomad/core');

test('Daemon & Studio Handshake Protocol: Registration, Proxy & Offline Handling', async () => {
  const daemonPort = 19800;
  const mockStudioPort = 19801;

  // 1. Start Daemon Server
  const daemon = new NomadDaemonServer({ port: daemonPort });
  await daemon.start();

  // Initially Studio is offline
  const offlineCheck = await fetch(`http://127.0.0.1:${daemonPort}/api/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'test before studio' })
  });
  assert.equal(offlineCheck.status, 503);
  const offlineJson = await offlineCheck.json();
  assert.equal(offlineJson.success, false);
  assert.equal(offlineJson.errorCode, ErrorCodes.DAEMON_STUDIO_OFFLINE_001);

  // 2. Start Mock Studio Bridge Server
  let receivedForwarded = null;
  const mockStudio = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedForwarded = {
        url: req.url,
        method: req.method,
        forwardedBy: req.headers['x-forwarded-by'],
        body: body ? JSON.parse(body) : {}
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { dispatched: true, echo: receivedForwarded.body } }));
    });
  });

  await new Promise(resolve => mockStudio.listen(mockStudioPort, '127.0.0.1', resolve));

  // 3. Register Mock Studio with Daemon
  const regRes = await fetch(`http://127.0.0.1:${daemonPort}/api/studio/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bridgePort: mockStudioPort, pid: 77777, version: '1.4.0' })
  });
  assert.equal(regRes.status, 200);
  const regJson = await regRes.json();
  assert.equal(regJson.success, true);
  assert.equal(regJson.data.status, 'registered');

  // Check /api/studio/status
  const statusRes = await fetch(`http://127.0.0.1:${daemonPort}/api/studio/status`);
  const statusJson = await statusRes.json();
  assert.equal(statusJson.data.online, true);
  assert.equal(statusJson.data.activeStudio.bridgePort, mockStudioPort);

  // 4. Test Reverse Proxy: Call Daemon /api/prompt -> Forwarded to Mock Studio
  const promptRes = await fetch(`http://127.0.0.1:${daemonPort}/api/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Hello via Daemon Gateway' })
  });
  assert.equal(promptRes.status, 200);
  const promptJson = await promptRes.json();
  assert.equal(promptJson.success, true);
  assert.equal(promptJson.data.dispatched, true);

  // Verify mock studio received the forwarded request
  assert.ok(receivedForwarded);
  assert.equal(receivedForwarded.forwardedBy, 'nomad-daemon');
  assert.equal(receivedForwarded.body.prompt, 'Hello via Daemon Gateway');

  // 5. Heartbeat
  const hbRes = await fetch(`http://127.0.0.1:${daemonPort}/api/studio/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const hbJson = await hbRes.json();
  assert.equal(hbJson.success, true);
  assert.equal(hbJson.data.status, 'alive');

  // 6. Unregister
  const unregRes = await fetch(`http://127.0.0.1:${daemonPort}/api/studio/unregister`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  const unregJson = await unregRes.json();
  assert.equal(unregJson.data.status, 'unregistered');

  // After unregister, Studio is offline again
  const postUnreg = await fetch(`http://127.0.0.1:${daemonPort}/api/studio/status`);
  const postUnregJson = await postUnreg.json();
  assert.equal(postUnregJson.data.online, false);

  // Clean up
  await new Promise(resolve => mockStudio.close(resolve));
  await daemon.stop();
});
