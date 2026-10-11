const { describe, it } = require('node:test');
const assert = require('node:assert');
const { createHerdrRunner, BotRoster } = require('../../index');

const bot = {
  ...new BotRoster().getAgent('agent-claude').data,
  platform: 'herdr',
  handle: 'reviewer',
};

/**
 * Fake execFile that answers like the herdr CLI.
 * @param {Record<string, { stdout?: string, stderr?: string, code?: number | string }>} answers keyed by subcommand
 */
function fakeExec(answers) {
  /** @type {string[][]} */
  const calls = [];
  const exec = async (/** @type {string} */ file, /** @type {string[]} */ args) => {
    calls.push([file, ...args]);
    const key = args[0] === '--version' ? 'version' : args[1];
    const answer = answers[key] || {};
    if (answer.code) {
      const error = /** @type {any} */ (new Error(answer.stderr || 'failed'));
      error.code = answer.code;
      error.stderr = answer.stderr || '';
      throw error;
    }
    return { stdout: answer.stdout || '', stderr: '' };
  };
  return { exec, calls };
}

const prompted = (status) =>
  JSON.stringify({
    id: 'cli:agent:prompt',
    result: { type: 'agent_prompted', agent: { agent_status: status } },
  });

describe('Bots - herdr runner', () => {
  it('prompts the agent named after the bot handle and reads back its reply', async () => {
    const { exec, calls } = fakeExec({
      prompt: { stdout: prompted('done') },
      read: { stdout: '  Found 2 issues in diff.\n' },
    });
    const runner = createHerdrRunner({ execFile: exec, timeoutMs: 1000 });

    const res = await runner.run(bot, 'Review the diff');

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.text, 'Found 2 issues in diff.');
    assert.deepStrictEqual(calls[0], [
      'herdr',
      'agent',
      'prompt',
      'reviewer',
      'Review the diff',
      '--wait',
      '--timeout',
      '1000',
    ]);
    assert.deepStrictEqual(calls[1].slice(0, 4), ['herdr', 'agent', 'read', 'reviewer']);
  });

  it('reports a blocked herdr agent instead of reading a half-finished screen', async () => {
    const { exec, calls } = fakeExec({ prompt: { stdout: prompted('blocked') } });
    const runner = createHerdrRunner({ execFile: exec });

    const res = await runner.run(bot, 'go');

    assert.strictEqual(res.errorCode, 'BOT_HERDR_FAILED_011');
    assert.strictEqual(res.details.blocked, true);
    assert.strictEqual(calls.length, 1);
  });

  it('maps herdr error JSON to a failure with its code', async () => {
    const { exec } = fakeExec({
      prompt: {
        code: 1,
        stderr: JSON.stringify({
          error: { code: 'agent_not_found', message: 'no agent reviewer' },
        }),
      },
    });
    const res = await createHerdrRunner({ execFile: exec }).run(bot, 'go');
    assert.strictEqual(res.errorCode, 'BOT_HERDR_FAILED_011');
    assert.match(res.message, /agent_not_found/);
  });

  it('reports herdr as unavailable when the binary is missing', async () => {
    const { exec } = fakeExec({ prompt: { code: 'ENOENT' }, version: { code: 'ENOENT' } });
    const runner = createHerdrRunner({ execFile: exec });

    assert.strictEqual(await runner.isAvailable(), false);
    assert.strictEqual((await runner.run(bot, 'go')).errorCode, 'BOT_HERDR_UNAVAILABLE_010');
  });

  it('refuses agent names herdr would reject and oversized prompts', async () => {
    const { exec, calls } = fakeExec({});
    const runner = createHerdrRunner({ execFile: exec });

    const badName = await runner.run({ ...bot, handle: 'Bad Name', canonicalChat: null }, 'go');
    const tooLong = await runner.run(bot, 'x'.repeat(9000));

    assert.strictEqual(badName.errorCode, 'BOT_MESSAGE_INVALID_008');
    assert.strictEqual(tooLong.errorCode, 'BOT_MESSAGE_INVALID_008');
    assert.strictEqual(calls.length, 0);
  });

  it('prefers an explicit herdr agent name bound on the canonical chat', async () => {
    const { exec, calls } = fakeExec({
      prompt: { stdout: prompted('idle') },
      read: { stdout: 'ok' },
    });
    const bound = {
      ...bot,
      canonicalChat: { platform: 'herdr', url: null, herdrAgentName: 'codex-1' },
    };

    await createHerdrRunner({ execFile: exec }).run(bound, 'go');

    assert.strictEqual(calls[0][3], 'codex-1');
  });
});
