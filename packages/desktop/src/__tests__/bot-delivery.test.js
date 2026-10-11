const test = require('node:test');
const assert = require('node:assert');
const { BotRoster, ok, err } = require('@nomad/core');
const { createBotDeliver } = require('../bot-delivery.js');

const roster = new BotRoster();
const bot = (/** @type {string} */ id) => /** @type {any} */ (roster.getAgent(id).data);
const meta = { chainId: 'c', hops: 1, from: null };

test('delivers to webview bots through the webview task runner with the bot as context', async () => {
  /** @type {any[]} */
  const calls = [];
  const deliver = createBotDeliver({
    runWebviewTask: async (platform, prompt, context) => {
      calls.push({ platform, prompt, context });
      return ok({ text: 'web reply' });
    },
  });

  const res = await deliver(bot('agent-claude'), 'hello', meta);

  assert.strictEqual(res.data.text, 'web reply');
  assert.strictEqual(calls[0].platform, 'claude');
  assert.strictEqual(calls[0].context.agent.id, 'agent-claude');
});

test('delivers to local-model bots with the persona as the system prompt', async () => {
  /** @type {any[]} */
  const requests = [];
  const local = { ...bot('agent-local'), persona: 'You triage logs.' };
  const deliver = createBotDeliver({
    runWebviewTask: async () => ok({ text: '' }),
    localModelClient: {
      chatCompletion: async (/** @type {any} */ req) => {
        requests.push(req);
        return ok({ content: 'local reply' });
      },
    },
  });

  const res = await deliver(local, 'hello', meta);

  assert.strictEqual(res.data.text, 'local reply');
  assert.deepStrictEqual(requests[0].messages[0], { role: 'system', content: 'You triage logs.' });
});

test('passes local-model failures through as Results', async () => {
  const deliver = createBotDeliver({
    runWebviewTask: async () => ok({ text: '' }),
    localModelClient: { chatCompletion: async () => err('LOCAL_MODEL_DOWN', 'offline') },
  });

  const res = await deliver(bot('agent-local'), 'hello', meta);

  assert.strictEqual(res.success, false);
});

test('uses a registered extra runner (for example herdr) by platform', async () => {
  const deliver = createBotDeliver({
    runWebviewTask: async () => ok({ text: '' }),
    runners: { herdr: async () => ok({ text: 'cli reply' }) },
  });

  const res = await deliver({ ...bot('agent-claude'), platform: 'herdr' }, 'hello', meta);

  assert.strictEqual(res.data.text, 'cli reply');
});

test('fails clearly for a platform nobody can deliver to', async () => {
  const deliver = createBotDeliver({ runWebviewTask: async () => ok({ text: '' }) });

  const res = await deliver({ ...bot('agent-claude'), platform: 'mystery' }, 'hello', meta);

  assert.strictEqual(res.errorCode, 'BOT_INJECT_FAILED_006');
});
