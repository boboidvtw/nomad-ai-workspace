const { describe, it } = require('node:test');
const assert = require('node:assert');
const { BotRoster, handleBotRequest } = require('../../index');

/**
 * @param {BotRoster} roster
 * @param {string} method
 * @param {string} pathname
 * @param {unknown} [body]
 */
function call(roster, method, pathname, body) {
  const url = new URL(`http://x${pathname}`);
  return handleBotRequest({
    method,
    pathname: url.pathname,
    searchParams: url.searchParams,
    readBody: async () => body,
    services: { roster },
  });
}

describe('Bots - HTTP route handler', () => {
  it('ignores paths it does not own', async () => {
    assert.strictEqual(await call(new BotRoster(), 'GET', '/api/tasks'), null);
  });

  it('lists bots', async () => {
    const res = await call(new BotRoster(), 'GET', '/api/bots');
    assert.strictEqual(res.status, 200);
    assert.ok(res.payload.data.some((/** @type {any} */ b) => b.handle === 'claude'));
  });

  it('creates, patches and deletes a bot', async () => {
    const roster = new BotRoster();
    const created = await call(roster, 'POST', '/api/bots', { id: 'bot-scribe', name: 'Scribe' });
    assert.strictEqual(created.status, 200);

    const patched = await call(roster, 'PATCH', '/api/bots/bot-scribe', { persona: 'Minutes' });
    assert.strictEqual(patched.payload.data.persona, 'Minutes');

    const removed = await call(roster, 'DELETE', '/api/bots/bot-scribe');
    assert.strictEqual(removed.status, 200);
    assert.strictEqual(roster.getAgent('bot-scribe').success, false);
  });

  it('maps handle conflicts to 409 and unknown bots to 404', async () => {
    const roster = new BotRoster();
    const conflict = await call(roster, 'PATCH', '/api/bots/agent-gemini', {
      displayName: 'Claude',
    });
    assert.strictEqual(conflict.status, 409);

    const missing = await call(roster, 'PATCH', '/api/bots/nope', { persona: 'x' });
    assert.strictEqual(missing.status, 404);
  });

  it('marks a bot as seen', async () => {
    const roster = new BotRoster();
    roster.setBotState('agent-claude', 'done');
    const res = await call(roster, 'POST', '/api/bots/agent-claude/seen');
    assert.strictEqual(res.payload.data.state, 'idle');
  });

  it('resolves a mention', async () => {
    const res = await call(new BotRoster(), 'GET', '/api/bots/resolve?mention=%40grok');
    assert.strictEqual(res.payload.data.id, 'agent-grok');
  });

  it('round-trips the Drive sync payload', async () => {
    const roster = new BotRoster();
    const exported = await call(roster, 'GET', '/api/bots/sync');
    assert.strictEqual(exported.payload.data.version, 1);

    const imported = await call(roster, 'POST', '/api/bots/sync', {
      version: 1,
      bots: [{ id: 'bot-x', name: 'X Bot' }],
    });
    assert.strictEqual(imported.payload.data.merged, 1);
  });

  it('rejects a non-decodable bot id instead of throwing', async () => {
    const res = await call(new BotRoster(), 'DELETE', '/api/bots/%E0%A4%A');
    assert.strictEqual(res.status, 400);
  });
});
