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

test('Daemon Server: P1/P2/P3 Roadmap Endpoints (Artifacts, Diff, LocalModel, MCP, RAG)', async () => {
  const daemon = new NomadDaemonServer({ port: 19890 });
  await daemon.start();
  try {
    const fence = '```';
    const sampleText = ['Here is a diagram:', fence + 'mermaid', 'graph TD;', 'A-->B;', fence].join(String.fromCharCode(10));
    const extRes = await makeRequest(19890, '/api/artifacts/extract', 'POST', { text: sampleText });
    assert.strictEqual(extRes.status, 200);
    assert.strictEqual(extRes.data.success, true);
    assert.strictEqual(extRes.data.data.length, 1);
    assert.strictEqual(extRes.data.data[0].type, 'mermaid');

    const sbRes = await makeRequest(19890, '/api/artifacts/sandbox', 'POST', { code: '<h1>Hello Sandbox</h1>', type: 'html' });
    assert.strictEqual(sbRes.status, 200);
    assert.strictEqual(sbRes.data.success, true);
    assert.ok(sbRes.data.data.html.includes('Hello Sandbox'));

    const textA = ['line 1', 'line 2'].join(String.fromCharCode(10));
    const textB = ['line 1', 'line 2 modified'].join(String.fromCharCode(10));
    const diffRes = await makeRequest(19890, '/api/diff', 'POST', { textA, textB });
    assert.strictEqual(diffRes.status, 200);
    assert.strictEqual(diffRes.data.success, true);
    assert.strictEqual(diffRes.data.data.stats.added, 1);

    const probeRes = await makeRequest(19890, '/api/local-model/probe?port=59999', 'GET');
    assert.strictEqual(probeRes.status, 200);
    assert.strictEqual(probeRes.data.success, true);
    assert.strictEqual(probeRes.data.data.online, false);

    const toolsRes = await makeRequest(19890, '/api/mcp/tools', 'GET');
    assert.strictEqual(toolsRes.status, 200);
    assert.strictEqual(toolsRes.data.success, true);
    assert.ok(toolsRes.data.data.some(t => t.name === 'read_file'));

    const ingestRes = await makeRequest(19890, '/api/rag/ingest', 'POST', {
      id: 'doc-1',
      title: 'Nomad Protocol',
      text: 'Nomad AI Studio connects ChatGPT, Claude, and Gemini with local LM Studio models.'
    });
    assert.strictEqual(ingestRes.status, 200);
    assert.strictEqual(ingestRes.data.success, true);

    const retRes = await makeRequest(19890, '/api/rag/retrieve', 'POST', {
      prompt: 'Nomad AI LM Studio'
    });
    assert.strictEqual(retRes.status, 200);
    assert.strictEqual(retRes.data.success, true);
    assert.ok(retRes.data.data.chunks.length > 0);
  } finally {
    await daemon.stop();
  }
});

test('Daemon Server: /api/local-model/chat reaches the local model client', async () => {
  const daemon = new NomadDaemonServer({ port: 19891 });
  await daemon.start();
  try {
    // Port 1 on loopback is closed, so the client fails fast with a 502 instead of crashing (500).
    const res = await makeRequest(19891, '/api/local-model/chat', 'POST', { prompt: 'hi', port: 1 });
    assert.strictEqual(res.status, 502);
    assert.strictEqual(res.data.success, false);
    assert.ok(!/not a function/.test(res.data.message), res.data.message);
  } finally {
    await daemon.stop();
  }
});
