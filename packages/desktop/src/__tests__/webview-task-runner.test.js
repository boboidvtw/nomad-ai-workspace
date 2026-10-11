const test = require('node:test');
const assert = require('node:assert');
const { createWebviewTaskRunner } = require('../webview-task-runner.js');

const okInject = async (/** @type {string} */ platform) => ({ [platform]: { ok: true } });
const settled = async () => ({ settled: true, text: 'reply' });

test('returns the settled reply as a Result', async () => {
  const runner = createWebviewTaskRunner({ inject: okInject, awaitSettled: settled });

  const res = await runner.run('claude', 'hi');

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data.text, 'reply');
});

test('fails with BOT_INJECT_FAILED_006 when the prompt could not be injected', async () => {
  const runner = createWebviewTaskRunner({
    inject: async () => ({ claude: { ok: false, error: 'composer not found' } }),
    awaitSettled: settled,
  });

  const res = await runner.run('claude', 'hi');

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.errorCode, 'BOT_INJECT_FAILED_006');
});

test('fails with BOT_INJECT_FAILED_006 when the platform view is missing', async () => {
  const runner = createWebviewTaskRunner({ inject: async () => ({}), awaitSettled: settled });

  const res = await runner.run('grok', 'hi');

  assert.strictEqual(res.errorCode, 'BOT_INJECT_FAILED_006');
});

test('fails with BOT_RESPONSE_TIMEOUT_005 when the reply never settles', async () => {
  const runner = createWebviewTaskRunner({
    inject: okInject,
    awaitSettled: async () => ({ settled: false, text: 'partial' }),
  });

  const res = await runner.run('claude', 'hi');

  assert.strictEqual(res.errorCode, 'BOT_RESPONSE_TIMEOUT_005');
});

test('serialises runs on the same platform so replies are not mixed up', async () => {
  /** @type {string[]} */
  const order = [];
  const runner = createWebviewTaskRunner({
    inject: async (platform, text) => {
      order.push(`inject:${text}`);
      return { [platform]: { ok: true } };
    },
    awaitSettled: async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('settled');
      return { settled: true, text: 'x' };
    },
  });

  await Promise.all([runner.run('claude', 'a'), runner.run('claude', 'b')]);

  assert.deepStrictEqual(order, ['inject:a', 'settled', 'inject:b', 'settled']);
});

test('a failed run does not block the next one on the same platform', async () => {
  let calls = 0;
  const runner = createWebviewTaskRunner({
    inject: async (platform) => {
      calls++;
      if (calls === 1) throw new Error('boom');
      return { [platform]: { ok: true } };
    },
    awaitSettled: settled,
  });

  const first = await runner.run('claude', 'a');
  const second = await runner.run('claude', 'b');

  assert.strictEqual(first.success, false);
  assert.strictEqual(second.success, true);
});

// --- M2: canonical bot chats -------------------------------------------------

const { BotRoster } = require('@nomad/core');

/**
 * @param {{ currentUrls?: string[], settle?: { settled: boolean, text: string } }} [opts]
 */
function botHarness(opts = {}) {
  const roster = new BotRoster();
  /** @type {any[]} */
  const calls = [];
  const urls = [...(opts.currentUrls || ['https://claude.ai/chat/new-1'])];
  const runner = createWebviewTaskRunner({
    roster,
    inject: async (platform, text) => {
      calls.push({ op: 'inject', text });
      return { [platform]: { ok: true } };
    },
    awaitSettled: async () => opts.settle || { settled: true, text: 'reply' },
    openChat: async (platform, url) => {
      calls.push({ op: 'open', platform, url });
      return { ok: true };
    },
    currentUrl: async () => (urls.length > 1 ? urls.shift() : urls[0]) || null,
  });
  const bot = () => roster.getAgent('agent-claude').data;
  const run = (prompt = 'Do it') =>
    runner.run('claude', prompt, { agent: bot(), task: { id: 't1', title: 'Do it' } });
  return { roster, calls, bot, run };
}

test('M2: first run opens a new chat, sends the persona, then binds the conversation', async () => {
  const h = botHarness();
  h.roster.updateBot('agent-claude', { persona: 'You are the lead architect.' });

  const res = await h.run();

  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(h.calls[0], { op: 'open', platform: 'claude', url: null });
  assert.match(h.calls[1].text, /^You are the lead architect\.[\s\S]*Do it$/);
  assert.strictEqual(h.bot().canonicalChat.url, 'https://claude.ai/chat/new-1');
});

test('M2: later runs reuse the bound conversation without repeating the persona', async () => {
  const h = botHarness({ currentUrls: ['https://claude.ai/chat/abc'] });
  h.roster.updateBot('agent-claude', { persona: 'Persona' });
  h.roster.bindCanonicalChat('agent-claude', {
    platform: 'claude',
    url: 'https://claude.ai/chat/abc',
  });

  await h.run('Second task');

  assert.deepStrictEqual(h.calls[0], {
    op: 'open',
    platform: 'claude',
    url: 'https://claude.ai/chat/abc',
  });
  assert.strictEqual(h.calls[1].text, 'Second task');
});

test('M2: a deleted conversation is rebound to a fresh chat and logged', async () => {
  const h = botHarness({
    currentUrls: ['https://claude.ai/new', 'https://claude.ai/chat/fresh'],
  });
  h.roster.bindCanonicalChat('agent-claude', {
    platform: 'claude',
    url: 'https://claude.ai/chat/gone',
  });

  await h.run();

  assert.deepStrictEqual(
    h.calls.filter((c) => c.op === 'open').map((c) => c.url),
    ['https://claude.ai/chat/gone', null],
  );
  assert.strictEqual(h.bot().canonicalChat.url, 'https://claude.ai/chat/fresh');
  assert.ok(h.bot().timeline.some((e) => e.type === 'chat-rebound'));
});

test('M2: never binds a home page as the canonical chat', async () => {
  const h = botHarness({ currentUrls: ['https://claude.ai/new'] });

  await h.run();

  assert.strictEqual(h.bot().canonicalChat, null);
});

test('M2: tracks bot state and records the task in the timeline', async () => {
  const h = botHarness();

  await h.run();

  assert.strictEqual(h.bot().state, 'done');
  assert.ok(h.bot().timeline.some((e) => e.type === 'task' && e.taskId === 't1'));
});

test('M2: a reply that never settles leaves the bot in the unknown state', async () => {
  const h = botHarness({ settle: { settled: false, text: '' } });

  const res = await h.run();

  assert.strictEqual(res.success, false);
  assert.strictEqual(h.bot().state, 'unknown');
});

test('M2: runs on a platform the bot is not bound to do not touch its binding', async () => {
  const h = botHarness();
  h.roster.updateBot('agent-claude', { platform: 'chatgpt' });
  h.roster.bindCanonicalChat('agent-claude', {
    platform: 'chatgpt',
    url: 'https://chatgpt.com/c/keep',
  });

  await h.run();

  assert.strictEqual(h.bot().canonicalChat.url, 'https://chatgpt.com/c/keep');
});
