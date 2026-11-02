const test = require('node:test');
const assert = require('node:assert');
const { createRelayHistory } = require('../relay-history.js');

/** Minimal in-memory stand-in for SessionManager's workspace methods. */
function fakeSessionManager() {
  /** @type {Record<string, any>} */
  const ws = { id: 'ws-1', history: [], turns: 0 };
  return {
    ws,
    getActiveWorkspace: () => ws,
    captureActiveUrls: () => ws,
    /** @param {string} _id @param {Record<string, any>} turn */
    addTurn(_id, turn) {
      ws.history = [...ws.history, { type: 'turn-complete', ...turn }];
      ws.turns = ws.history.length;
      return ws;
    },
    /** @param {string} _id @param {Record<string, any>} partial */
    updateWorkspace(_id, partial) {
      Object.assign(ws, partial);
      return ws;
    },
  };
}

test('relay history: a slow in-page rename does not record the last turn twice', async () => {
  const sm = fakeSessionManager();
  /** @type {() => void} */
  let finishRename = () => {};
  const rename = () => new Promise((resolve) => (finishRename = () => resolve(undefined)));
  const orchestratorHistory = [
    { speaker: 'user', type: 'user-prompt', content: 'topic' },
    { speaker: 'gemini', type: 'assistant-response', content: 'last reply' },
  ];
  const relay = createRelayHistory({
    getSessionManager: () => sm,
    getOrchestratorHistory: () => orchestratorHistory,
    rename,
  });

  // The orchestrator does not await onStep, so onComplete runs while the rename is pending.
  const pending = relay.onTurnComplete({
    speaker: 'gemini',
    round: 1,
    canonicalTitle: 'Topic',
    content: 'last reply',
  });
  relay.onComplete();
  finishRename();
  await pending;

  assert.strictEqual(sm.ws.completed, true);
  assert.strictEqual(sm.ws.turns, 2);
  assert.deepStrictEqual(
    sm.ws.history.map((/** @type {any} */ t) => t.content),
    ['topic', 'last reply'],
  );
});

test('relay history: turns are recorded even when the rename fails', async () => {
  const sm = fakeSessionManager();
  const relay = createRelayHistory({
    getSessionManager: () => sm,
    getOrchestratorHistory: () => [],
    rename: async () => {
      throw new Error('page gone');
    },
  });

  await relay.onTurnComplete({ speaker: 'grok', round: 2, canonicalTitle: 'T', content: 'hi' });

  assert.strictEqual(sm.ws.history.length, 1);
  assert.strictEqual(sm.ws.history[0].speaker, 'grok');
  assert.strictEqual(sm.ws.history[0].round, 2);
});

test('relay history: onComplete keeps the saved history when the orchestrator has none', () => {
  const sm = fakeSessionManager();
  sm.ws.history = [{ speaker: 'claude', content: 'kept' }];
  const relay = createRelayHistory({
    getSessionManager: () => sm,
    getOrchestratorHistory: () => [],
    rename: async () => {},
  });

  const updated = relay.onComplete();

  assert.ok(updated);
  assert.deepStrictEqual(sm.ws.history, [{ speaker: 'claude', content: 'kept' }]);
});

test('relay history: without an active workspace nothing is written', async () => {
  const relay = createRelayHistory({
    getSessionManager: () => null,
    getOrchestratorHistory: () => [],
    rename: async () => {},
  });
  await relay.onTurnComplete({ speaker: 'grok', canonicalTitle: 'T', content: 'x' });
  assert.strictEqual(relay.onComplete(), null);
});
