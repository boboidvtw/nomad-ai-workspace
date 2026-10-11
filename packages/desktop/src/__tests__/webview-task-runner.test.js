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
