const test = require('node:test');
const assert = require('node:assert');
const { MultiAiOrchestrator } = require('../orchestrator.js');

test('Orchestrator: Validates initial inputs and rejects invalid configs', async () => {
  const orch = new MultiAiOrchestrator();

  // Empty prompt
  const res1 = await orch.start({ prompt: '   ' });
  assert.strictEqual(res1.success, false);
  assert.strictEqual(res1.errorCode, 'ORCHESTRATOR_START_EMPTY_PROMPT_002');

  // Sequence with < 2 platforms
  const res2 = await orch.start({ prompt: 'Hello', sequence: ['claude'] });
  assert.strictEqual(res2.success, false);
  assert.strictEqual(res2.errorCode, 'ORCHESTRATOR_START_INVALID_SEQUENCE_003');
});

test('Orchestrator: Executes full round-robin relay sequence with state events', async () => {
  const promptsInjected = [];
  const eventsEmitted = [];

  const mockResponses = {
    claude: 'Claude architecture proposal v1',
    chatgpt: 'ChatGPT security review and code patch',
  };

  const orch = new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 5,
    injectPrompt: async (platform, text) => {
      promptsInjected.push({ platform, text });
      return { ok: true };
    },
    extractResponse: async (platform) => {
      return { ok: true, text: mockResponses[platform] || 'Mock output' };
    },
    checkStreaming: async () => {
      return { ok: true, isStreaming: false };
    },
    onStep: (event) => {
      eventsEmitted.push(event.type);
    },
  });

  orch.turnDelayMs = 5;

  const startRes = await orch.start({
    prompt: 'Initial Goal',
    sequence: ['claude', 'chatgpt'],
    mode: 'relay',
    maxRounds: 1,
    turnDelayMs: 5,
  });

  assert.strictEqual(startRes.success, true);

  // Wait for loop completion
  let attempts = 0;
  while (orch.status === 'running' && attempts < 30) {
    await new Promise((r) => setTimeout(r, 20));
    attempts++;
  }

  assert.strictEqual(orch.status, 'completed');
  assert.strictEqual(promptsInjected.length, 2);
  assert.strictEqual(promptsInjected[0].platform, 'claude');
  assert.ok(promptsInjected[0].text.includes('Initial Goal'));
  assert.ok(promptsInjected[0].text.includes('【協作專案主題】'));

  assert.strictEqual(promptsInjected[1].platform, 'chatgpt');
  assert.ok(promptsInjected[1].text.includes('CLAUDE 的階段性輸出與任務交接'));
  assert.ok(promptsInjected[1].text.includes('Claude architecture proposal v1'));

  // Events check
  assert.ok(eventsEmitted.includes('turn-start'));
  assert.ok(eventsEmitted.includes('turn-complete'));
  assert.ok(eventsEmitted.includes('completed'));
});

test('Orchestrator: Pause, resume and stop controls', async () => {
  const orch = new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 10,
    injectPrompt: async () => ({ ok: true }),
    extractResponse: async () => ({ ok: true, text: 'Sample output' }),
    checkStreaming: async () => ({ ok: true, isStreaming: false }),
  });

  orch.turnDelayMs = 50;

  await orch.start({
    prompt: 'Testing controls',
    sequence: ['claude', 'chatgpt', 'gemini'],
    maxRounds: 2,
    turnDelayMs: 50,
  });

  assert.strictEqual(orch.status, 'running');

  // Pause
  const pRes = orch.pause();
  assert.strictEqual(pRes.success, true);
  assert.strictEqual(orch.status, 'paused');

  // Resume
  const rRes = orch.resume();
  assert.strictEqual(rRes.success, true);
  assert.strictEqual(orch.status, 'running');

  // Stop
  const sRes = orch.stop();
  assert.strictEqual(sRes.success, true);
  assert.strictEqual(orch.status, 'stopped');
});

test('Orchestrator: Settles via adaptive inactivity even if isStreaming remains true', async () => {
  const longText =
    'This is a detailed mock AI response containing more than forty characters for testing adaptive settlement.';
  const orch = new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 5,
    maxWaitMs: 1000,
    extractResponse: async () => ({ ok: true, text: longText }),
    checkStreaming: async () => ({ ok: true, isStreaming: true }), // Intentionally stuck on streaming
  });

  const startTime = Date.now();
  const text = await orch.waitForSettledResponse('chatgpt', 1000, 5);
  const elapsed = Date.now() - startTime;

  assert.strictEqual(text, longText);
  // Should settle in ~5 polls * 5ms = ~25-50ms, much faster than 1000ms maxWaitMs
  assert.ok(elapsed < 400, 'Should settle via adaptive inactivity before maxWaitMs');
});

test('Orchestrator: Retains monotonic baseline text if subsequent extract poll glitches', async () => {
  let callCount = 0;
  const goodText = 'Valid captured text before temporary glitch occurred.';
  const orch = new MultiAiOrchestrator({
    initialWaitMs: 0,
    pollIntervalMs: 5,
    maxWaitMs: 50,
    extractResponse: async () => {
      callCount++;
      if (callCount === 1) return { ok: true, text: goodText };
      return { ok: false, error: 'Network glitch' }; // Returns empty text on subsequent polls
    },
    checkStreaming: async () => ({ ok: true, isStreaming: false }),
  });

  const text = await orch.waitForSettledResponse('gemini', 50, 5);
  assert.strictEqual(text, goodText);
});

test('Orchestrator: Falls back to the default turn delay for non-numeric input', async () => {
  const orch = new MultiAiOrchestrator({
    initialWaitMs: 0,
    injectPrompt: async () => ({ ok: true }),
    extractResponse: async () => ({ ok: true, text: 'x' }),
    checkStreaming: async () => ({ ok: true, isStreaming: false }),
  });

  // IPC payloads are untyped; a bad value must not collapse the delay to NaN (= no delay).
  await orch.start({ prompt: 'Goal', sequence: ['claude', 'chatgpt'], turnDelayMs: 'abc' });
  assert.strictEqual(orch.turnDelayMs, 2500);
  orch.stop();

  const orch2 = new MultiAiOrchestrator({
    initialWaitMs: 0,
    injectPrompt: async () => ({ ok: true }),
  });
  await orch2.start({ prompt: 'Goal', sequence: ['claude', 'chatgpt'], turnDelayMs: -10 });
  assert.strictEqual(orch2.turnDelayMs, 0);
  orch2.stop();
});
