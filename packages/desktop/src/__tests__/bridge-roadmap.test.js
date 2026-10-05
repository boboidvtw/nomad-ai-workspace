const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { LocalSyncBridge } = require('../bridge');

function makeRequest(port, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: payload ? {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      } : {}
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

test('Bridge: P1/P2/P3 Roadmap Endpoints (Artifacts, Diff, LocalModel, MCP, RAG)', async () => {
  const bridge = new LocalSyncBridge({ port: 19885 });
  await bridge.start();
  try {
    // 1. Artifacts
    const fence = '```';
    const sampleText = ['Here is a diagram:', fence + 'mermaid', 'graph TD;', 'A-->B;', fence].join(String.fromCharCode(10));
    const extRes = await makeRequest(19885, '/api/artifacts/extract', 'POST', { text: sampleText });
    assert.strictEqual(extRes.status, 200);
    assert.strictEqual(extRes.data.success, true);
    assert.strictEqual(extRes.data.data.length, 1);

    // 2. Diff
    const diffRes = await makeRequest(19885, '/api/diff', 'POST', { textA: 'Common Header\nWorld', textB: 'Common Header\nNomad' });
    assert.strictEqual(diffRes.status, 200);
    assert.strictEqual(diffRes.data.success, true);
    assert.ok(diffRes.data.data.stats.similarityRatio > 0);

    // 3. Local Model Probe
    const probeRes = await makeRequest(19885, '/api/local-model/probe?port=59998', 'GET');
    assert.strictEqual(probeRes.status, 200);
    assert.strictEqual(probeRes.data.success, true);
    assert.strictEqual(probeRes.data.data.online, false);

    // 4. MCP Tools
    const toolsRes = await makeRequest(19885, '/api/mcp/tools', 'GET');
    assert.strictEqual(toolsRes.status, 200);
    assert.strictEqual(toolsRes.data.success, true);
    assert.ok(toolsRes.data.data.length >= 2);

    // 5. RAG Ingest and Retrieve
    const ingRes = await makeRequest(19885, '/api/rag/ingest', 'POST', { id: 'doc-rag', content: 'Nomad AI Super Station has zero dependencies' });
    assert.strictEqual(ingRes.status, 200);
    assert.strictEqual(ingRes.data.success, true);

    const retRes = await makeRequest(19885, '/api/rag/retrieve', 'POST', { prompt: 'Nomad dependencies' });
    assert.strictEqual(retRes.status, 200);
    assert.strictEqual(retRes.data.success, true);
    assert.ok(retRes.data.data.chunks.length > 0);
  } finally {
    await bridge.stop();
  }
});
