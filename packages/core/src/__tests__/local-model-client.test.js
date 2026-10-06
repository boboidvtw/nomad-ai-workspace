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

test('LocalModelClient: builds the endpoint from host/port when no endpoint is given', () => {
  assert.strictEqual(new LocalModelClient().endpoint, 'http://127.0.0.1:1234/v1');
  assert.strictEqual(new LocalModelClient({ host: 'localhost', port: 5555 }).endpoint, 'http://localhost:5555/v1');
  assert.strictEqual(
    new LocalModelClient({ endpoint: 'http://127.0.0.1:9000/v1', port: 5555 }).endpoint,
    'http://127.0.0.1:9000/v1'
  );
});

test('TaskRunner: executes local-model agent tasks through LocalModelClient', async () => {
  const { AgentRoster, TaskDispatcher, TaskRunner } = require('../../index');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      model: 'mock-llm-1',
      choices: [{ message: { role: 'assistant', content: 'Triage done.' } }],
      usage: { prompt_tokens: 12, completion_tokens: 30, total_tokens: 42 }
    }));
  });
  await new Promise(resolve => server.listen(19898, '127.0.0.1', resolve));

  try {
    const roster = new AgentRoster();
    // In-memory only: never touch the real ~/.nomad task store.
    const dispatcher = new TaskDispatcher({ roster, storagePath: '/dev/null/nomad-test-tasks.json' });
    const runner = new TaskRunner(dispatcher, {
      localModelClient: new LocalModelClient({ endpoint: 'http://127.0.0.1:19898/v1' })
    });
    const created = dispatcher.createTask({ title: 'Triage the inbox', assignee: 'agent-local' });
    assert.strictEqual(created.success, true);

    const runRes = await runner.dispatchAndRun(created.data.id, 'agent-local');
    assert.strictEqual(runRes.success, true, runRes.success ? '' : runRes.message);

    const task = dispatcher.tasks.get(created.data.id);
    assert.strictEqual(task.status, 'completed');
    assert.ok(task.logs.some(l => /42 tokens/.test(l.message)), 'summary should report usage.total_tokens');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
