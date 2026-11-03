const test = require('node:test');
const assert = require('node:assert');
const { MultiAiOrchestrator } = require('../orchestrator.js');

/**
 * A page that holds `replies` replies and `prompts` prompt bubbles. `promptIsBaseline` says the
 * last bubble is the one marked before the send, which is what a page that dropped the prompt
 * keeps showing.
 * @typedef {{ text: string, count: number, prompts?: number, promptIsBaseline?: boolean, streaming?: boolean }} PageState
 */

/**
 * Replays one page state per poll, then keeps the last one.
 * @param {PageState[]} states
 * @param {Record<string, any>} [options]
 */
function makeOrchestrator(states, options = {}) {
  let i = 0;
  const current = () => states[Math.min(i, states.length - 1)];
  return new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 2,
    maxWaitMs: 400,
    promptAckMs: 20,
    snapshotSettleMs: 0,
    checkStreaming: async () => ({ ok: true, isStreaming: Boolean(current().streaming) }),
    extractResponse: async () => {
      const { text, count, prompts, promptIsBaseline = false } = current();
      i++;
      return {
        ok: true,
        text,
        count,
        countOf: 'reply',
        isBaseline: false,
        ...(prompts === undefined ? {} : { promptCount: prompts, promptIsBaseline }),
      };
    },
    ...options,
  });
}

const OLD = { text: 'Old answer', count: 3, countOf: 'reply', promptCount: 3 };

test('a prompt the page never shows is reported as dropped before the reply time limit', async () => {
  const orch = makeOrchestrator([
    { text: 'Old answer', count: 3, prompts: 3, promptIsBaseline: true },
  ]);

  const started = Date.now();
  const res = await orch.awaitSettled('gemini', { previous: OLD });

  assert.deepStrictEqual(res, { settled: false, text: '', dropped: true });
  assert.ok(Date.now() - started < 300, 'gives up well before maxWaitMs');
});

test('a prompt bubble that shows and then disappears again is reported as dropped', async () => {
  const orch = makeOrchestrator([
    { text: 'Old answer', count: 3, prompts: 4 },
    { text: 'Old answer', count: 3, prompts: 3, promptIsBaseline: true },
  ]);

  const res = await orch.awaitSettled('gemini', { previous: OLD });

  assert.strictEqual(res.dropped, true);
});

test('a prompt the page shows is waited on even when the reply is slow', async () => {
  const orch = makeOrchestrator([{ text: 'Old answer', count: 3, prompts: 4 }]);

  const res = await orch.awaitSettled('gemini', { previous: OLD });

  assert.deepStrictEqual(res, { settled: false, text: '' });
});

test('a streaming page is not taken as having dropped the prompt', async () => {
  const orch = makeOrchestrator([
    { text: 'Old answer', count: 3, prompts: 3, promptIsBaseline: true, streaming: true },
  ]);

  const res = await orch.awaitSettled('gemini', { previous: OLD });

  assert.strictEqual(res.dropped, undefined);
});

test('a page whose prompts cannot be counted keeps the old behaviour', async () => {
  const orch = makeOrchestrator([{ text: 'Old answer', count: 3 }]);

  const res = await orch.awaitSettled('gemini', {
    previous: { text: 'Old answer', count: 3, countOf: 'reply', promptCount: null },
  });

  assert.deepStrictEqual(res, { settled: false, text: '' });
});

test('the first prompt of a new chat counts once any prompt bubble shows', async () => {
  const orch = makeOrchestrator([
    { text: '', count: 0, prompts: 0 },
    { text: 'Hello', count: 1, prompts: 1 },
  ]);

  const res = await orch.awaitSettled('gemini', {
    previous: { text: '', count: null, countOf: null, promptCount: 0 },
  });

  assert.deepStrictEqual(res, { settled: true, text: 'Hello' });
});

test('a new chat that never shows its first prompt is reported as dropped', async () => {
  const orch = makeOrchestrator([{ text: '', count: 0, prompts: 0 }]);

  const res = await orch.awaitSettled('gemini', {
    previous: { text: '', count: null, countOf: null, promptCount: 0 },
  });

  assert.strictEqual(res.dropped, true);
});

test('the snapshot taken before a send marks and counts the prompts on the page', async () => {
  /** @type {any[]} */
  const calls = [];
  const orch = makeOrchestrator([{ text: 'Old answer', count: 3, prompts: 3 }], {
    extractResponse: async (/** @type {string} */ _p, /** @type {any} */ options) => {
      calls.push(options);
      return { ok: true, text: 'Old answer', count: 3, countOf: 'reply', promptCount: 3 };
    },
  });

  const snapshot = await orch.readReplySnapshot('gemini');

  assert.deepStrictEqual(snapshot, OLD);
  assert.deepStrictEqual(calls[0], { markBaseline: true });
});

// --- Relay: one resend, then a quick failure -----------------------------------

/**
 * A gemini → chatgpt relay whose gemini page drops the first `drops` sends.
 * @param {number} drops
 */
async function relayWithDrops(drops) {
  /** @type {Record<string, string[]>} */
  const sent = { gemini: [], chatgpt: [] };
  /** @type {any[]} */
  const events = [];
  const orch = new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 2,
    maxWaitMs: 2000,
    promptAckMs: 20,
    snapshotSettleMs: 0,
    injectPrompt: async (/** @type {string} */ platform, /** @type {string} */ text) => {
      sent[platform].push(text);
      return { ok: true };
    },
    checkStreaming: async () => ({ ok: true, isStreaming: false }),
    extractResponse: async (/** @type {string} */ platform) => {
      if (platform === 'chatgpt') {
        return sent.chatgpt.length ? { ok: true, text: 'Review' } : { ok: false, text: '' };
      }
      return sent.gemini.length > drops
        ? { ok: true, text: 'New answer', count: 2, countOf: 'reply', promptCount: 2 }
        : {
            ok: true,
            text: 'Old answer',
            count: 1,
            countOf: 'reply',
            promptCount: 1,
            promptIsBaseline: true,
          };
    },
    onStep: (/** @type {any} */ event) => events.push(event),
  });
  await orch.start({ prompt: 'Q', sequence: ['gemini', 'chatgpt'], maxRounds: 1, turnDelayMs: 0 });
  const deadline = Date.now() + 3000;
  while (orch.status === 'running' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.strictEqual(orch.status, 'completed');
  return { sent: sent.gemini, events };
}

test('a relay sends a dropped prompt once more and takes the reply to the resend', async () => {
  const { sent, events } = await relayWithDrops(1);

  assert.strictEqual(sent.length, 2);
  assert.strictEqual(sent[0], sent[1]);
  assert.ok(events.some((e) => e.type === 'prompt-dropped' && e.speaker === 'gemini'));
  const done = events.find((e) => e.type === 'turn-complete' && e.speaker === 'gemini');
  assert.strictEqual(done?.content, 'New answer');
});

test('a relay fails the turn quickly when the resend is dropped too', async () => {
  const started = Date.now();
  const { sent, events } = await relayWithDrops(2);

  assert.strictEqual(sent.length, 2);
  const failed = events.find((e) => e.type === 'turn-failed' && e.speaker === 'gemini');
  assert.match(failed?.error || '', /未送達/);
  assert.ok(Date.now() - started < 1500, 'does not sit out maxWaitMs');
});
