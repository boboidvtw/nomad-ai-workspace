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
 * @param {{ currentUrls?: string[], settle?: { settled: boolean, text: string }, injectResults?: { ok: boolean, error?: string }[] }} [opts]
 */
function botHarness(opts = {}) {
  const roster = new BotRoster();
  /** @type {any[]} */
  const calls = [];
  const urls = [...(opts.currentUrls || ['https://claude.ai/chat/new-1'])];
  const injectResults = [...(opts.injectResults || [])];
  const runner = createWebviewTaskRunner({
    roster,
    inject: async (platform, text) => {
      calls.push({ op: 'inject', text });
      return { [platform]: injectResults.shift() || { ok: true } };
    },
    awaitSettled: async () => opts.settle || { settled: true, text: 'reply' },
    openChat: async (platform, url) => {
      calls.push({ op: 'open', platform, url });
      return { ok: true };
    },
    currentUrl: async () => (urls.length > 1 ? urls.shift() : urls[0]) || null,
    // These tests start where the wait for a late input box has already given up.
    composerWaitMs: 0,
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

test('M2: a conversation that opens without an input box is rebound to a fresh chat', async () => {
  // Grok keeps the URL of a conversation the account cannot see ("你需要存取權限"), so the
  // open looks fine and only the missing composer gives it away.
  const h = botHarness({
    currentUrls: ['https://claude.ai/chat/private', 'https://claude.ai/chat/fresh'],
    injectResults: [{ ok: false, error: 'Claude input not found' }],
  });
  h.roster.updateBot('agent-claude', { persona: 'Persona' });
  h.roster.bindCanonicalChat('agent-claude', {
    platform: 'claude',
    url: 'https://claude.ai/chat/private',
  });

  const res = await h.run('Task');

  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(
    h.calls.filter((c) => c.op === 'open').map((c) => c.url),
    ['https://claude.ai/chat/private', null],
  );
  assert.match(h.calls.filter((c) => c.op === 'inject')[1].text, /^Persona[\s\S]*Task$/);
  assert.strictEqual(h.bot().canonicalChat.url, 'https://claude.ai/chat/fresh');
  assert.ok(h.bot().timeline.some((e) => e.type === 'chat-rebound'));
});

test('M2: a fresh chat without an input box fails instead of retrying', async () => {
  const h = botHarness({ injectResults: [{ ok: false, error: 'Claude input not found' }] });

  const res = await h.run();

  assert.strictEqual(res.success, false);
  assert.strictEqual(h.calls.filter((c) => c.op === 'open').length, 1);
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

// --- M3: blocked state ------------------------------------------------------

/**
 * @param {Array<{ settled: boolean, text: string, blocked?: boolean, reason?: string }>} replies
 * @param {Partial<import('../webview-task-runner').WebviewTaskRunnerDeps>} [extra]
 */
function blockedHarness(replies, extra = {}) {
  const roster = new BotRoster();
  /** @type {any[]} */
  const notices = [];
  /** @type {string[]} */
  const states = [];
  const queue = [...replies];
  const origSet = roster.setBotState.bind(roster);
  roster.setBotState = (id, state) => {
    states.push(state);
    return origSet(id, state);
  };
  const runner = createWebviewTaskRunner({
    roster,
    inject: okInject,
    awaitSettled: async () => queue.shift() || { settled: false, text: '' },
    openChat: async () => ({ ok: true }),
    currentUrl: async () => 'https://claude.ai/chat/x',
    notify: (n) => notices.push(n),
    sleep: async () => {},
    blockedPollMs: 1,
    ...extra,
  });
  const run = () =>
    runner.run('claude', 'go', {
      agent: roster.getAgent('agent-claude').data,
      task: { id: 't1', title: 'go' },
    });
  return { roster, notices, states, run };
}

test('M3: a blocked bot is marked blocked, the user is notified once, and the run resumes', async () => {
  const blocked = { settled: false, text: '', blocked: true, reason: 'Claude usage limit reached' };
  const h = blockedHarness([blocked, blocked, { settled: true, text: 'after limit' }]);

  const res = await h.run();

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data.text, 'after limit');
  assert.deepStrictEqual(h.states, ['working', 'blocked', 'working', 'done']);
  assert.strictEqual(h.notices.length, 1);
  assert.match(h.notices[0].reason, /usage limit/);
  assert.ok(h.roster.getAgent('agent-claude').data.timeline.some((e) => e.type === 'state'));
});

test('M3: a bot that stays blocked past the budget fails and stays blocked', async () => {
  const blocked = { settled: false, text: '', blocked: true, reason: 'Signed out' };
  let now = 0;
  const h = blockedHarness(Array(50).fill(blocked), {
    maxBlockedMs: 10,
    sleep: async () => {
      now += 5;
    },
    now: () => now,
  });

  const res = await h.run();

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.errorCode, 'BOT_RESPONSE_TIMEOUT_005');
  assert.match(res.message, /Signed out/);
  assert.strictEqual(h.roster.getAgent('agent-claude').data.state, 'blocked');
});

test('reads the reply on the page before the send and hands it to the wait', async () => {
  /** @type {string[]} */
  const order = [];
  /** @type {any[]} */
  const waits = [];
  const runner = createWebviewTaskRunner({
    readReply: async () => {
      order.push('read');
      return { text: 'last answer', count: 2, countOf: 'reply' };
    },
    inject: async (platform) => {
      order.push('inject');
      return { [platform]: { ok: true } };
    },
    awaitSettled: async (_platform, options) => {
      waits.push(options);
      return { settled: true, text: 'new answer' };
    },
  });

  const res = await runner.run('claude', 'hi');

  assert.strictEqual(res.data.text, 'new answer');
  assert.deepStrictEqual(order, ['read', 'inject']);
  assert.deepStrictEqual(waits, [
    { previous: { text: 'last answer', count: 2, countOf: 'reply' } },
  ]);
});

// --- Cold pages: wait for the input box ---------------------------------------

/** @param {Array<{ ok: boolean, error?: string }>} results */
function coldHarness(results) {
  let clock = 0;
  /** @type {string[]} */
  const injected = [];
  const runner = createWebviewTaskRunner({
    inject: async (platform, text) => {
      injected.push(text);
      return { [platform]: results.shift() || { ok: true } };
    },
    awaitSettled: settled,
    composerWaitMs: 5000,
    composerRetryMs: 1000,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  return { runner, injected, elapsed: () => clock };
}

test('a page that has not mounted its input box yet is sent to again once it has', async () => {
  const missing = { ok: false, error: 'Grok input element not found' };
  const h = coldHarness([missing, missing]);

  const res = await h.runner.run('grok', 'hi');

  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(h.injected, ['hi', 'hi', 'hi']);
});

test('the wait for an input box gives up after composerWaitMs', async () => {
  const missing = { ok: false, error: 'Grok input element not found' };
  const h = coldHarness(Array.from({ length: 20 }, () => ({ ...missing })));

  const res = await h.runner.run('grok', 'hi');

  assert.strictEqual(res.success, false);
  assert.match(res.message, /input element not found/);
  assert.strictEqual(h.elapsed(), 5000);
});

test('other send failures are not retried, since the text may already be in the box', async () => {
  const h = coldHarness([{ ok: false, error: 'Claude did not send the prompt' }]);

  const res = await h.runner.run('claude', 'hi');

  assert.strictEqual(res.success, false);
  assert.deepStrictEqual(h.injected, ['hi']);
});

// --- Dropped prompts: one resend, then a quick failure -------------------------

/**
 * @param {Array<{ settled: boolean, text: string, dropped?: boolean }>} waits - one per send
 */
function droppingHarness(waits) {
  /** @type {string[]} */
  const order = [];
  const runner = createWebviewTaskRunner({
    readReply: async () => {
      order.push('read');
      return { text: 'old', count: 1, countOf: 'reply', promptCount: 1 };
    },
    inject: async (platform) => {
      order.push('inject');
      return { [platform]: { ok: true } };
    },
    awaitSettled: async () => waits.shift() || { settled: false, text: '' },
  });
  return { runner, order };
}

test('a prompt the page dropped is sent once more, after a fresh read of the page', async () => {
  const h = droppingHarness([
    { settled: false, text: '', dropped: true },
    { settled: true, text: 'answer' },
  ]);

  const res = await h.runner.run('gemini', 'hi');

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data.text, 'answer');
  assert.deepStrictEqual(h.order, ['read', 'inject', 'read', 'inject']);
});

test('a prompt dropped twice fails as not delivered instead of timing out', async () => {
  const h = droppingHarness([
    { settled: false, text: '', dropped: true },
    { settled: false, text: '', dropped: true },
  ]);

  const res = await h.runner.run('gemini', 'hi');

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.errorCode, 'BOT_INJECT_FAILED_006');
  assert.match(res.message, /dropped the prompt/);
  assert.deepStrictEqual(h.order, ['read', 'inject', 'read', 'inject']);
});
