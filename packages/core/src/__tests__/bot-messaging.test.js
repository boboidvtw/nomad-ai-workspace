const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  BotRoster,
  BotLoopGuard,
  BotMessageRouter,
  parseMentions,
  registerMessageAgentTool,
  McpGateway,
  ok,
} = require('../../index');

function setup(options = {}) {
  const roster = new BotRoster();
  /** @type {any[]} */
  const delivered = [];
  const router = new BotMessageRouter({
    roster,
    deliver: async (bot, text) => {
      delivered.push({ to: bot.id, text });
      return ok({ text: `reply from ${bot.handle}` });
    },
    ...options,
  });
  return { roster, router, delivered };
}

describe('Bots - mention parsing', () => {
  it('finds @handles but ignores e-mail addresses', () => {
    assert.deepStrictEqual(parseMentions('@claude and @Research-Buddy, mail me at a@b.com'), [
      'claude',
      'research-buddy',
    ]);
    assert.deepStrictEqual(parseMentions('@claude @claude'), ['claude']);
    assert.deepStrictEqual(parseMentions('no mentions'), []);
  });
});

describe('Bots - loop guard', () => {
  it('admits up to maxEvents per window, then cools down', () => {
    let now = 0;
    const guard = new BotLoopGuard({ maxEvents: 2, windowMs: 100, cooldownMs: 50, now: () => now });

    assert.strictEqual(guard.admit('chain').allowed, true);
    assert.strictEqual(guard.admit('chain').allowed, true);
    assert.strictEqual(guard.admit('chain').allowed, false);
    now = 40;
    assert.strictEqual(guard.admit('chain').allowed, false);
    now = 200;
    assert.strictEqual(guard.admit('chain').allowed, true);
  });

  it('tracks chains independently', () => {
    const guard = new BotLoopGuard({ maxEvents: 1 });
    assert.ok(guard.admit('a').allowed);
    assert.ok(guard.admit('b').allowed);
  });
});

describe('Bots - message router', () => {
  it('delivers a user message to the resolved bot and returns its reply', async () => {
    const { router, delivered, roster } = setup();

    const res = await router.send({ to: '@gemini', message: 'Find sources' });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.reply, 'reply from gemini');
    assert.deepStrictEqual(delivered, [{ to: 'agent-gemini', text: 'Find sources' }]);
    assert.ok(roster.getAgent('agent-gemini').data.timeline.some((e) => e.type === 'message'));
  });

  it('signs bot-to-bot messages with the sender identity', async () => {
    const { router, delivered } = setup();

    await router.send({ from: 'agent-claude', to: 'grok', message: 'Audit this' });

    assert.match(delivered[0].text, /^Message from 🤖 Claude Lead Architect \(@claude\)/);
    assert.match(delivered[0].text, /Audit this$/);
  });

  it('rejects unknown targets, self-messages, empty and oversized messages', async () => {
    const { router } = setup();

    assert.strictEqual(
      (await router.send({ to: '@ghost', message: 'x' })).errorCode,
      'ROSTER_AGENT_NOT_FOUND_001',
    );
    assert.strictEqual(
      (await router.send({ from: 'agent-claude', to: 'claude', message: 'x' })).errorCode,
      'BOT_MESSAGE_INVALID_008',
    );
    assert.strictEqual(
      (await router.send({ to: 'claude', message: '  ' })).errorCode,
      'BOT_MESSAGE_INVALID_008',
    );
    assert.strictEqual(
      (await router.send({ to: 'claude', message: 'x'.repeat(9000) })).errorCode,
      'BOT_MESSAGE_INVALID_008',
    );
  });

  it('stops a relay chain at the hop limit', async () => {
    const { router, delivered } = setup({ hopLimit: 2 });

    const res = await router.send({ from: 'agent-claude', to: 'grok', message: 'x', hops: 2 });

    assert.strictEqual(res.errorCode, 'BOT_LOOP_GUARD_TRIPPED_007');
    assert.strictEqual(delivered.length, 0);
  });

  it('stops two bots that keep messaging each other', async () => {
    const { router } = setup({ guard: new BotLoopGuard({ maxEvents: 3 }) });
    /** @type {any[]} */
    const results = [];
    for (let i = 0; i < 5; i++) {
      const from = i % 2 ? 'agent-grok' : 'agent-claude';
      const to = i % 2 ? 'claude' : 'grok';
      results.push(await router.send({ from, to, message: `ping ${i}`, chainId: 'loop' }));
    }
    assert.deepStrictEqual(
      results.map((r) => r.success),
      [true, true, true, false, false],
    );
  });

  it('routes every known mention in a prompt and leaves unknown ones alone', async () => {
    const { router, delivered } = setup();

    const res = await router.dispatchMentions('@claude @gemini compare notes, cc @nobody');

    assert.deepStrictEqual(res.data.routed.map((r) => r.to).sort(), [
      'agent-claude',
      'agent-gemini',
    ]);
    assert.deepStrictEqual(res.data.unknown, ['nobody']);
    assert.strictEqual(delivered.length, 2);
  });

  it('reports a delivery failure without throwing', async () => {
    const roster = new BotRoster();
    const router = new BotMessageRouter({
      roster,
      deliver: async () => ({
        success: false,
        errorCode: 'BOT_RESPONSE_TIMEOUT_005',
        message: 'slow',
      }),
    });

    const res = await router.send({ to: 'claude', message: 'hi' });

    assert.strictEqual(res.errorCode, 'BOT_RESPONSE_TIMEOUT_005');
  });
});

describe('Bots - message_agent MCP tool', () => {
  it('lets an MCP client message a bot through the router', async () => {
    const { router, delivered } = setup();
    const gateway = new McpGateway({ allowedPaths: [] });
    registerMessageAgentTool(gateway, router);

    const res = await gateway.callTool('message_agent', {
      from: 'agent-claude',
      target: 'gemini',
      message: 'Summarise the spec',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(delivered[0].to, 'agent-gemini');
    assert.ok(gateway.listTools().data.some((t) => t.name === 'message_agent'));
  });
});

describe('Bots - messaging routes', () => {
  it('routes POST /api/bots/mentions through the router', async () => {
    const { router, roster } = setup();
    const { handleBotRequest } = require('../../index');

    const res = await handleBotRequest({
      method: 'POST',
      pathname: '/api/bots/mentions',
      searchParams: new URLSearchParams(),
      readBody: async () => ({ text: '@grok check this' }),
      services: { roster, router },
    });

    assert.strictEqual(res?.status, 200);
    assert.strictEqual(res?.payload.data.routed[0].to, 'agent-grok');
  });

  it('answers 503 when no router is attached (daemon without a Studio)', async () => {
    const { handleBotRequest } = require('../../index');
    const res = await handleBotRequest({
      method: 'POST',
      pathname: '/api/bots/messages',
      searchParams: new URLSearchParams(),
      readBody: async () => ({}),
      services: { roster: new BotRoster() },
    });
    assert.strictEqual(res?.status, 503);
  });
});
