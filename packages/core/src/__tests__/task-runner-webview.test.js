const { describe, it } = require('node:test');
const assert = require('node:assert');
const { TaskDispatcher, TaskRunner, TASK_STATUS, ok, err } = require('../../index');

function setup(delegate) {
  const dispatcher = new TaskDispatcher();
  const runner = new TaskRunner(dispatcher, { orchestratorDelegate: delegate });
  const task = dispatcher.createTask({ title: 'Summarise the release notes' }).data;
  return { dispatcher, runner, task };
}

describe('TaskRunner - webview delegate contract', () => {
  it('stores the captured AI reply from a Result-shaped delegate as the artifact', async () => {
    const { runner, task } = setup(async () => ok({ text: 'Claude says: v1.5 adds Bots.' }));

    const res = await runner.dispatchAndRun(task.id, 'agent-claude');

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.status, TASK_STATUS.COMPLETED);
    assert.strictEqual(res.data.artifacts[0].content, 'Claude says: v1.5 adds Bots.');
  });

  it('fails the task when the delegate reports a failure instead of faking a deliverable', async () => {
    const { runner, task, dispatcher } = setup(async () =>
      err('BOT_RESPONSE_TIMEOUT_005', 'claude did not settle'),
    );

    const res = await runner.dispatchAndRun(task.id, 'agent-claude');

    assert.strictEqual(res.success, false);
    const stored = dispatcher.getTask(task.id).data;
    assert.strictEqual(stored.status, TASK_STATUS.FAILED);
    assert.strictEqual(stored.artifacts.length, 0);
  });

  it('fails the task when a Result-shaped delegate returns an empty reply', async () => {
    const { runner, task } = setup(async () => ok({ text: '   ' }));

    const res = await runner.dispatchAndRun(task.id, 'agent-claude');

    assert.strictEqual(res.success, false);
  });

  it('passes the task and agent to the delegate so it can target the bot chat', async () => {
    /** @type {any[]} */
    const calls = [];
    const { runner, task } = setup(async (platform, prompt, context) => {
      calls.push({ platform, prompt, context });
      return ok({ text: 'done' });
    });

    await runner.dispatchAndRun(task.id, 'agent-claude');

    assert.strictEqual(calls[0].platform, 'claude');
    assert.ok(calls[0].prompt.includes('Summarise the release notes'));
    assert.strictEqual(calls[0].context.agent.id, 'agent-claude');
    assert.strictEqual(calls[0].context.task.id, task.id);
  });

  it('keeps legacy { text } delegates working', async () => {
    const { runner, task } = setup(async () => ({ text: 'legacy reply' }));

    const res = await runner.dispatchAndRun(task.id, 'agent-claude');

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.artifacts[0].content, 'legacy reply');
  });

  it('labels fire-and-forget delegates honestly instead of claiming a reply', async () => {
    const { runner, task } = setup(async () => ({ claude: { ok: true, data: { sent: true } } }));

    const res = await runner.dispatchAndRun(task.id, 'agent-claude');

    assert.strictEqual(res.success, true);
    assert.match(res.data.artifacts[0].content, /response was not captured/i);
  });
});
