const test = require('node:test');
const assert = require('node:assert');
const { MultiAiOrchestrator } = require('../orchestrator.js');

function makeOrchestrator(extract, streaming = async () => ({ ok: true, isStreaming: false })) {
  return new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 2,
    maxWaitMs: 60,
    extractResponse: extract,
    checkStreaming: streaming,
  });
}

test('awaitSettled reports a settled reply', async () => {
  const orch = makeOrchestrator(async () => ({ ok: true, text: 'Final answer' }));

  const res = await orch.awaitSettled('claude');

  assert.deepStrictEqual(res, { settled: true, text: 'Final answer' });
});

test('awaitSettled reports a timeout instead of returning placeholder text', async () => {
  const orch = makeOrchestrator(
    async () => ({ ok: true, text: '' }),
    async () => ({ ok: true, isStreaming: true }),
  );

  const res = await orch.awaitSettled('claude');

  assert.strictEqual(res.settled, false);
  assert.strictEqual(res.text, '');
});

test('awaitSettled is not cut short by a previously stopped relay', async () => {
  const orch = makeOrchestrator(async () => ({ ok: true, text: 'Still works' }));
  orch.isAborted = true;

  const res = await orch.awaitSettled('chatgpt');

  assert.strictEqual(res.settled, true);
});

test('waitForSettledResponse keeps its placeholder on timeout', async () => {
  const orch = makeOrchestrator(
    async () => ({ ok: true, text: '' }),
    async () => ({ ok: true, isStreaming: true }),
  );

  const text = await orch.waitForSettledResponse('grok');

  assert.match(text, /grok 回應擷取超時/);
});

test('awaitSettled stops early and reports why when the page is blocked', async () => {
  const orch = new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 2,
    maxWaitMs: 1000,
    extractResponse: async () => ({ ok: true, text: '' }),
    checkStreaming: async () => ({ ok: true, isStreaming: true }),
    checkBlocked: async () => ({ blocked: true, reason: 'Claude usage limit reached' }),
  });

  const started = Date.now();
  const res = await orch.awaitSettled('claude');

  assert.strictEqual(res.settled, false);
  assert.strictEqual(res.blocked, true);
  assert.strictEqual(res.reason, 'Claude usage limit reached');
  assert.ok(Date.now() - started < 500);
});
