const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { LocalModelClient, isOk, isErr, ErrorCodes } = require('../../index');

test('LocalModelClient: probes endpoint and handles offline gracefully', async () => {
  const client = new LocalModelClient({ endpoint: 'http://127.0.0.1:19999/v1' });
  const probeRes = await client.probe();
  // Server is offline, should return error without throwing uncaught exception
  assert.strictEqual(isErr(probeRes), true);
  assert.strictEqual(probeRes.errorCode, ErrorCodes.LOCAL_MODEL_UNREACHABLE_001);
});

test('LocalModelClient: chats with mock OpenAI compatible server', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/v1/chat/completions') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: 'chatcmpl-mock',
        model: 'mock-llm-1',
        choices: [{ message: { role: 'assistant', content: 'Hello from local AI!' } }]
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise(resolve => server.listen(19899, '127.0.0.1', resolve));

  try {
    const client = new LocalModelClient({ endpoint: 'http://127.0.0.1:19899/v1' });
    const chatRes = await client.chatCompletion({ prompt: 'Hi' });
    assert.strictEqual(isOk(chatRes), true);
    assert.strictEqual(chatRes.data.content, 'Hello from local AI!');
    assert.strictEqual(chatRes.data.model, 'mock-llm-1');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
