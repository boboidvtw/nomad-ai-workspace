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
