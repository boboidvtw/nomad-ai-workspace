const test = require('node:test');
const assert = require('node:assert');
const { MultiAiOrchestrator } = require('../orchestrator.js');

/**
 * Replays one page state per poll, then keeps the last one.
 * @param {Array<{ text: string, count?: number, countOf?: string, streaming?: boolean }>} states
 */
function makeOrchestrator(states) {
  let i = 0;
  const current = () => states[Math.min(i, states.length - 1)];
  return new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 2,
    maxWaitMs: 80,
    checkStreaming: async () => ({ ok: true, isStreaming: Boolean(current().streaming) }),
    extractResponse: async () => {
      const { text, count, countOf = 'reply' } = current();
      i++;
      return count === undefined ? { ok: true, text } : { ok: true, text, count, countOf };
    },
  });
}

const OLD = { text: 'Old answer', count: 3, countOf: 'reply' };

test('a dropped prompt is not answered with the old reply when the page blinks', async () => {
  // The send never reached the platform: the page re-renders (empty read, stop button flicker)
  // and then shows the same three replies as before.
  const orch = makeOrchestrator([
    { text: '', count: 3, streaming: true },
    { text: 'Old answer', count: 3 },
  ]);

  const res = await orch.awaitSettled('claude', { previous: OLD });

  assert.strictEqual(res.settled, false);
  assert.strictEqual(res.text, '');
});

test('a new reply that repeats the old text is accepted once the page holds one more reply', async () => {
  const orch = makeOrchestrator([
    { text: 'Old answer', count: 3, streaming: true },
    { text: 'Old answer', count: 4 },
  ]);

  const res = await orch.awaitSettled('claude', { previous: OLD });

  assert.deepStrictEqual(res, { settled: true, text: 'Old answer' });
});

test('a new, different reply is accepted when the count goes up', async () => {
  const orch = makeOrchestrator([
    { text: 'Old answer', count: 3 },
    { text: 'New', count: 4, streaming: true },
    { text: 'New answer', count: 4 },
  ]);

  const res = await orch.awaitSettled('claude', { previous: OLD });

  assert.deepStrictEqual(res, { settled: true, text: 'New answer' });
});

test('counts read through another selector are not compared; the text rule decides', async () => {
  const orch = makeOrchestrator([{ text: 'Different reply', count: 1, countOf: 'fallback' }]);

  const res = await orch.awaitSettled('claude', { previous: OLD });

  assert.deepStrictEqual(res, { settled: true, text: 'Different reply' });
});

test('a page that shows fewer replies than before is not treated as answered', async () => {
  // The conversation reloaded and is filling in again; the old reply is still last.
  const orch = makeOrchestrator([
    { text: '', count: 0, streaming: true },
    { text: 'Reply two', count: 2 },
    { text: 'Old answer', count: 3 },
  ]);

  const res = await orch.awaitSettled('claude', { previous: OLD });

  assert.strictEqual(res.settled, false);
  assert.strictEqual(res.text, '');
});

test('readReplySnapshot returns the text with its reply count', async () => {
  const orch = makeOrchestrator([{ text: '  hi  ', count: 5, countOf: 'reply' }]);

  assert.deepStrictEqual(await orch.readReplySnapshot('claude'), {
    text: 'hi',
    count: 5,
    countOf: 'reply',
  });
});

test('readReplySnapshot reports no count when the extractor gives none or fails', async () => {
  const orch = makeOrchestrator([{ text: 'hi' }]);
  assert.deepStrictEqual(await orch.readReplySnapshot('claude'), {
    text: 'hi',
    count: null,
    countOf: null,
  });

  const broken = new MultiAiOrchestrator({
    extractResponse: async () => {
      throw new Error('page gone');
    },
  });
  assert.deepStrictEqual(await broken.readReplySnapshot('claude'), {
    text: '',
    count: null,
    countOf: null,
  });
});
