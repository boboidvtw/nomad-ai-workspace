const test = require('node:test');
const assert = require('node:assert');
const { DEFAULT_TEMPLATES, MultiAiOrchestrator } = require('../orchestrator.js');

const NOT_STREAMING = async () => ({ ok: true, isStreaming: false });
const QUESTION = '把邏輯思維寫成程式，讓中小模型只負責語言，這可行嗎？';

/**
 * Runs a relay against fake pages and returns what each platform was sent.
 * @param {Record<string, string>} replies - the reply each platform shows once it was sent a prompt
 * @param {Record<string, any>} [options] - overrides for the orchestrator
 * @param {Record<string, any>} [startOptions]
 */
async function runRelay(replies, options = {}, startOptions = {}) {
  /** @type {Record<string, string[]>} */
  const sent = {};
  /** @type {any[]} */
  const events = [];
  const orch = new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 2,
    maxWaitMs: 200,
    silentWaitMs: 20,
    injectPrompt: async (/** @type {string} */ platform, /** @type {string} */ text) => {
      (sent[platform] ||= []).push(text);
      return { ok: true };
    },
    extractResponse: async (/** @type {string} */ platform) => ({
      ok: true,
      text: sent[platform] ? replies[platform] || '' : '',
    }),
    checkStreaming: NOT_STREAMING,
    onStep: (/** @type {any} */ event) => events.push(event),
    ...options,
  });
  await orch.start({
    prompt: QUESTION,
    sequence: Object.keys(replies),
    mode: 'debate',
    maxRounds: 1,
    turnDelayMs: 0,
    ...startOptions,
  });
  const deadline = Date.now() + 2000;
  while (orch.status === 'running' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.strictEqual(orch.status, 'completed');
  return { sent, events, orch };
}

test('relay waits ten minutes by default, not 45 seconds', () => {
  assert.strictEqual(new MultiAiOrchestrator().maxWaitMs, 600000);
});

test('a thinking pause longer than a few polls does not end the turn', async () => {
  const status = '正在用繁體中文撰寫對 ChatGPT 提案的審查回覆。'.repeat(3);
  const final = status + '這才是完整的回覆。';
  let polls = 0;
  const orch = new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 2,
    maxWaitMs: 500,
    stuckStreamingMs: 400,
    extractResponse: async () => ({ ok: true, text: ++polls < 30 ? status : final }),
    checkStreaming: async () => ({ ok: true, isStreaming: polls < 35 }),
  });

  const { text } = await orch.awaitSettled('claude');

  assert.strictEqual(text, final);
});

test('every handoff repeats the original question in every mode', () => {
  for (const mode of ['relay', 'debate', 'master']) {
    const prompt = DEFAULT_TEMPLATES[mode]('claude', 'gemini', '上一棒的回覆', null, QUESTION);
    assert.ok(prompt.includes(QUESTION), `${mode} should carry the question`);
    assert.ok(prompt.includes('上一棒的回覆'), `${mode} should carry the reply`);
  }
});

test('the third speaker receives the question and the whole previous reply', async () => {
  const claudeReply = '完整回覆'.repeat(2000);
  const { sent } = await runRelay({ chatgpt: 'ChatGPT 的論點', claude: claudeReply, gemini: 'ok' });

  assert.ok(sent.gemini[0].includes(QUESTION));
  assert.ok(sent.gemini[0].includes(claudeReply));
});

test('a platform that stays silent is skipped and hands on the last real reply', async () => {
  const { sent, events, orch } = await runRelay({
    chatgpt: 'ChatGPT 的論點',
    gemini: '',
    grok: 'ok',
  });

  assert.ok(sent.grok[0].includes('CHATGPT'));
  assert.ok(sent.grok[0].includes('ChatGPT 的論點'));
  assert.ok(!sent.grok[0].includes('回應擷取超時'));
  assert.ok(events.some((e) => e.type === 'turn-failed' && e.speaker === 'gemini'));
  assert.strictEqual(orch.history.find((h) => h.speaker === 'gemini')?.type, 'assistant-failed');
});

test('a failed first speaker leaves the next one with the original question', async () => {
  const { sent } = await runRelay({ chatgpt: '', claude: 'ok' });

  assert.ok(sent.claude[0].includes(QUESTION));
  assert.ok(!sent.claude[0].includes('CHATGPT'));
});

test('an injector failure skips the turn at once instead of waiting for a reply', async () => {
  /** @type {string[]} */
  const claudePrompts = [];
  /** @type {any[]} */
  const events = [];
  const orch = new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 2,
    maxWaitMs: 60000,
    silentWaitMs: 60000,
    injectPrompt: async (/** @type {string} */ platform, /** @type {string} */ text) => {
      if (platform === 'gemini') return { ok: false, error: 'Gemini input element not found' };
      if (platform === 'claude') claudePrompts.push(text);
      return { ok: true };
    },
    extractResponse: async (/** @type {string} */ platform) => ({
      ok: true,
      text: platform === 'claude' && claudePrompts.length ? 'Claude 的回覆' : '',
    }),
    checkStreaming: NOT_STREAMING,
    onStep: (/** @type {any} */ event) => events.push(event),
  });
  await orch.start({
    prompt: QUESTION,
    sequence: ['gemini', 'claude'],
    maxRounds: 1,
    turnDelayMs: 0,
  });
  const deadline = Date.now() + 1000;
  while (orch.status === 'running' && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2));
  }

  assert.strictEqual(orch.status, 'completed');
  const failed = events.find((e) => e.type === 'turn-failed');
  assert.strictEqual(failed.speaker, 'gemini');
  assert.match(failed.error, /Gemini input element not found/);
});

test('an injector that never returns does not hang the relay', async () => {
  const { events } = await runRelay(
    { grok: '', copilot: 'ok' },
    {
      pageCallTimeoutMs: 20,
      injectPrompt: async (/** @type {string} */ platform) =>
        platform === 'grok' ? new Promise(() => {}) : { ok: true },
      extractResponse: async () => ({ ok: true, text: '' }),
    },
  );

  assert.ok(events.some((e) => e.type === 'turn-failed' && e.speaker === 'grok'));
});

test('a page read that never returns does not hang the relay', async () => {
  const { events } = await runRelay(
    { grok: '', copilot: 'ok' },
    {
      pageCallTimeoutMs: 10,
      extractResponse: async () => new Promise(() => {}),
      checkStreaming: async () => new Promise(() => {}),
    },
  );

  assert.deepStrictEqual(
    events.filter((e) => e.type === 'turn-failed').map((e) => e.speaker),
    ['grok', 'copilot'],
  );
});

test('a reply cut off by the time limit is handed on marked as incomplete', async () => {
  const { sent, events } = await runRelay(
    { chatgpt: '還沒寫完的回覆', claude: 'ok' },
    {
      maxWaitMs: 20,
      checkStreaming: async (/** @type {string} */ platform) => ({
        ok: true,
        isStreaming: platform === 'chatgpt',
      }),
    },
  );

  assert.ok(sent.claude[0].includes('還沒寫完的回覆'));
  assert.ok(sent.claude[0].includes('內容可能不完整'));
  const turn = events.find((e) => e.type === 'turn-complete' && e.speaker === 'chatgpt');
  assert.strictEqual(turn.incomplete, true);
});

test('task runs keep waiting through silence: silentWaitMs is for relays only', async () => {
  const orch = new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 2,
    maxWaitMs: 60,
    silentWaitMs: 5,
    extractResponse: async () => ({ ok: true, text: '' }),
    checkStreaming: NOT_STREAMING,
  });

  const startedAt = Date.now();
  await orch.awaitSettled('claude');

  assert.ok(Date.now() - startedAt >= 55);
});
