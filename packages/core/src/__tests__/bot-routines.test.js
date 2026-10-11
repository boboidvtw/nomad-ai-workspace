const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  BotRoster,
  TaskDispatcher,
  TaskRunner,
  RecurringScheduler,
  routineLabel,
  handleBotRequest,
  ok,
} = require('../../index');

function setup() {
  const roster = new BotRoster();
  const dispatcher = new TaskDispatcher({ roster });
  const runner = new TaskRunner(dispatcher, {
    orchestratorDelegate: async () => ok({ text: 'Inbox: 3 urgent mails' }),
  });
  const scheduler = new RecurringScheduler({ dispatcher, taskRunner: runner, autoPersist: false });
  return { roster, dispatcher, scheduler };
}

const template = (/** @type {string} */ assignee) => ({
  title: 'Summarise my inbox',
  assignee,
  requireApproval: false,
});

describe('Bots - routines', () => {
  it('rejects a routine assigned to a bot that does not exist', () => {
    const { scheduler } = setup();
    const res = scheduler.addSchedule({ name: 'Morning inbox', taskTemplate: template('ghost') });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.errorCode, 'TASK_SCHEDULE_INVALID_010');
  });

  it('keeps routines for webview bots switched off until the user enables them', () => {
    const { scheduler } = setup();
    const webview = scheduler.addSchedule({
      name: 'Inbox',
      taskTemplate: template('agent-claude'),
    });
    const local = scheduler.addSchedule({ name: 'Triage', taskTemplate: template('agent-local') });
    const explicit = scheduler.addSchedule({
      name: 'Opted in',
      enabled: true,
      taskTemplate: template('agent-claude'),
    });

    assert.strictEqual(webview.data.enabled, false);
    assert.strictEqual(local.data.enabled, true);
    assert.strictEqual(explicit.data.enabled, true);
  });

  it('writes each routine run to the bot timeline', async () => {
    const { scheduler, roster } = setup();
    const added = scheduler.addSchedule({
      name: 'Morning inbox',
      enabled: true,
      taskTemplate: template('agent-claude'),
    });

    await scheduler.triggerSchedule(added.data.id);

    const entry = roster.getAgent('agent-claude').data.timeline.find((e) => e.type === 'routine');
    assert.ok(entry);
    assert.strictEqual(entry.scheduleId, added.data.id);
    assert.match(entry.summary, /Morning inbox/);
  });

  it('lists only the routines of one bot', () => {
    const { scheduler } = setup();
    scheduler.addSchedule({ name: 'A', taskTemplate: template('agent-claude') });
    scheduler.addSchedule({ name: 'B', taskTemplate: template('agent-gemini') });

    const names = scheduler.listSchedules({ assignee: 'agent-claude' }).map((s) => s.name);

    assert.ok(names.includes('A'));
    assert.ok(!names.includes('B'));
  });

  it('labels routines with the bot handle like Hermes does', () => {
    const { roster } = setup();
    roster.updateBot('agent-gemini', { displayName: 'Research Buddy' });
    const label = routineLabel(
      { name: 'Weekly digest', taskTemplate: template('agent-gemini') },
      roster,
    );
    assert.strictEqual(label, '[bot:research-buddy] Weekly digest');
  });

  it('serves a bot routines list over /api/bots/:id/routines', async () => {
    const { scheduler, roster } = setup();
    scheduler.addSchedule({ name: 'A', taskTemplate: template('agent-claude') });

    const res = await handleBotRequest({
      method: 'GET',
      pathname: '/api/bots/agent-claude/routines',
      searchParams: new URLSearchParams(),
      readBody: async () => ({}),
      services: { roster, scheduler },
    });

    assert.strictEqual(res?.status, 200);
    assert.strictEqual(res?.payload.data[0].label, '[bot:claude] A');
  });
});
