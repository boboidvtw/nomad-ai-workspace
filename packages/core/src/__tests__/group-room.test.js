const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BotRoster, GroupRoomManager, handleBotRequest, ok } = require('../../index');

/**
 * @param {{ delayMs?: number, failFor?: string, storagePath?: string, replies?: Record<string, string[]> }} [opts]
 */
function setup(opts = {}) {
  const roster = new BotRoster();
  /** @type {Array<{ to: string, text: string }>} */
  const prompts = [];
  /** @type {any[]} */
  const events = [];
  const rooms = new GroupRoomManager({
    roster,
    storagePath: opts.storagePath,
    onEvent: (type, data) => events.push({ type, data }),
    deliver: async (bot, text) => {
      prompts.push({ to: bot.id, text });
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      if (bot.id === opts.failFor) return { success: false, errorCode: 'X', message: 'down' };
      const scripted = opts.replies?.[bot.id];
      if (scripted && scripted.length > 0) return ok({ text: scripted.shift() });
      return ok({ text: `${bot.handle} says hi` });
    },
  });
  const room = rooms.create({
    name: 'Design review',
    memberIds: ['agent-claude', 'agent-grok'],
  }).data;
  return { roster, rooms, room, prompts, events };
}

describe('Bots - group rooms', () => {
  it('validates room members', () => {
    const { rooms } = setup();
    assert.strictEqual(rooms.create({ name: 'x', memberIds: ['ghost'] }).success, false);
    assert.strictEqual(rooms.create({ name: '', memberIds: ['agent-claude'] }).success, false);
    assert.strictEqual(rooms.create({ name: 'solo', memberIds: [] }).success, false);
  });

  it('drives every member in turn and records the transcript', async () => {
    const { rooms, room, prompts } = setup();

    const res = rooms.post(room.id, { text: 'Review the bots spec' });
    await rooms.whenIdle(room.id);

    assert.strictEqual(res.success, true);
    assert.deepStrictEqual(
      prompts.map((p) => p.to),
      ['agent-claude', 'agent-grok'],
    );
    assert.match(prompts[1].text, /claude says hi/, 'second member sees the first reply');
    const log = rooms.get(room.id).data.log;
    assert.deepStrictEqual(
      log.map((e) => e.speaker),
      ['user', 'agent-claude', 'agent-grok'],
    );
  });

  it('only drives the members a message @mentions', async () => {
    const { rooms, room, prompts } = setup();

    rooms.post(room.id, { text: '@grok what breaks?' });
    await rooms.whenIdle(room.id);

    assert.deepStrictEqual(
      prompts.map((p) => p.to),
      ['agent-grok'],
    );
  });

  it('queues messages sent while members are replying instead of interrupting', async () => {
    const { rooms, room, prompts } = setup({ delayMs: 5 });

    rooms.post(room.id, { text: 'first' });
    const second = rooms.post(room.id, { text: 'second' });
    await rooms.whenIdle(room.id);

    assert.strictEqual(second.data.queued, true);
    assert.strictEqual(prompts.length, 4);
    assert.deepStrictEqual(
      rooms
        .get(room.id)
        .data.log.filter((e) => e.speaker === 'user')
        .map((e) => e.text),
      ['first', 'second'],
    );
  });

  it('stop holds every member until @all releases them', async () => {
    const { rooms, room, prompts } = setup({ delayMs: 5 });

    rooms.post(room.id, { text: 'go' });
    rooms.stop(room.id);
    await rooms.whenIdle(room.id);
    const afterStop = prompts.length;

    rooms.post(room.id, { text: 'anyone?' });
    await rooms.whenIdle(room.id);
    assert.strictEqual(prompts.length, afterStop, 'held members are not driven');

    rooms.post(room.id, { text: '@all resume' });
    await rooms.whenIdle(room.id);
    assert.strictEqual(prompts.length, afterStop + 2);
  });

  it('a held member can be released alone by mentioning it', async () => {
    const { rooms, room, prompts } = setup();
    rooms.stop(room.id);

    rooms.post(room.id, { text: '@claude only you' });
    await rooms.whenIdle(room.id);

    assert.deepStrictEqual(
      prompts.map((p) => p.to),
      ['agent-claude'],
    );
  });

  it('logs a failed member turn and keeps going', async () => {
    const { rooms, room, prompts } = setup({ failFor: 'agent-claude' });

    rooms.post(room.id, { text: 'hello' });
    await rooms.whenIdle(room.id);

    assert.strictEqual(prompts.length, 2);
    const failed = rooms.get(room.id).data.log.find((e) => e.speaker === 'agent-claude');
    assert.strictEqual(failed?.error, true);
  });

  it('emits room events for the UI', async () => {
    const { rooms, room, events } = setup();
    rooms.post(room.id, { text: 'hello' });
    await rooms.whenIdle(room.id);
    assert.ok(events.some((e) => e.type === 'room:message'));
    assert.ok(events.some((e) => e.type === 'room:status' && e.data.status === 'idle'));
  });

  it('persists rooms and their transcripts', async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-rooms-')), 'rooms.json');
    const { rooms, room } = setup({ storagePath: file });
    rooms.post(room.id, { text: 'remember me' });
    await rooms.whenIdle(room.id);
    assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);

    const restored = new GroupRoomManager({
      roster: new BotRoster(),
      deliver: async () => ok({ text: '' }),
      storagePath: file,
    });
    restored.loadFromDisk();

    assert.strictEqual(restored.get(room.id).data.log[0].text, 'remember me');
    assert.strictEqual(restored.get(room.id).data.status, 'idle');
  });

  it('serves rooms over /api/bots/rooms', async () => {
    const { rooms, roster, room } = setup();
    const call = (
      /** @type {string} */ method,
      /** @type {string} */ pathname,
      /** @type {any} */ body,
    ) =>
      handleBotRequest({
        method,
        pathname,
        searchParams: new URLSearchParams(),
        readBody: async () => body,
        services: { roster, rooms },
      });

    assert.strictEqual((await call('GET', '/api/bots/rooms'))?.payload.data.length, 1);
    const posted = await call('POST', `/api/bots/rooms/${room.id}/messages`, { text: 'hi' });
    assert.strictEqual(posted?.status, 200);
    await rooms.whenIdle(room.id);
    assert.strictEqual((await call('GET', '/api/bots/rooms/nope'))?.status, 404);
  });
  // Borrowed from Cumora's coordination rules (glance-protocol.ts, COORDINATION.md §5b, convene.ts).
  describe('coordination (borrowed from Cumora)', () => {
    it('tells members they may pass and how to record a decision', async () => {
      const { rooms, room, prompts } = setup();
      rooms.post(room.id, { text: 'hello' });
      await rooms.whenIdle(room.id);
      assert.match(prompts[0].text, /\[PASS\]/);
      assert.match(prompts[0].text, /DECISION:/);
    });

    it('records a [PASS] reply as a yield and keeps it out of the next prompt', async () => {
      const { rooms, room, prompts } = setup({ replies: { 'agent-claude': ['  [pass] '] } });
      rooms.post(room.id, { text: 'anything to add?' });
      await rooms.whenIdle(room.id);

      const entry = rooms.get(room.id).data.log.find((e) => e.speaker === 'agent-claude');
      assert.strictEqual(entry?.kind, 'passed');
      const transcript = prompts[1].text.split('--- Room transcript ---')[1];
      assert.doesNotMatch(transcript, /claude/i, 'the yield is not shown to the next member');
    });

    it('holds a reply that repeats a recent message verbatim', async () => {
      const { rooms, room, prompts } = setup({
        replies: { 'agent-claude': ['Ship it on Friday.'], 'agent-grok': ['ship it  on friday'] },
      });
      rooms.post(room.id, { text: 'when?' });
      await rooms.whenIdle(room.id);
      rooms.post(room.id, { text: 'again' });
      await rooms.whenIdle(room.id);

      const log = rooms.get(room.id).data.log;
      const grok = log.find((e) => e.speaker === 'agent-grok');
      assert.strictEqual(grok?.kind, 'held');
      assert.strictEqual(grok?.text, 'ship it  on friday', 'the held text is kept for the UI');
      const lastPrompt = prompts[prompts.length - 1].text;
      assert.doesNotMatch(lastPrompt, /ship it {2}on friday/, 'held text stays out of context');
    });

    it('does not hold a reply that only shares a prefix with an earlier one', async () => {
      const { rooms, room } = setup({
        replies: { 'agent-claude': ['Ship it.'], 'agent-grok': ['Ship it after QA.'] },
      });
      rooms.post(room.id, { text: 'when?' });
      await rooms.whenIdle(room.id);
      const grok = rooms.get(room.id).data.log.find((e) => e.speaker === 'agent-grok');
      assert.strictEqual(grok?.kind, undefined);
    });

    it('collects DECISION lines into the room decisions', async () => {
      const { rooms, room, events } = setup({
        replies: {
          'agent-claude': ['We weighed both.\nDECISION: Use SQLite for v1\nMore notes.'],
          'agent-grok': ['決議：週五前完成 review'],
        },
      });
      rooms.post(room.id, { text: 'decide' });
      await rooms.whenIdle(room.id);

      const decisions = rooms.get(room.id).data.decisions;
      assert.deepStrictEqual(
        decisions.map((d) => [d.by, d.text]),
        [
          ['agent-claude', 'Use SQLite for v1'],
          ['agent-grok', '週五前完成 review'],
        ],
      );
      assert.ok(events.some((e) => e.type === 'room:decision'));
    });

    it('loads rooms saved before decisions existed', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-rooms-'));
      const file = path.join(dir, 'rooms.json');
      fs.writeFileSync(
        file,
        JSON.stringify({
          version: 1,
          rooms: [{ id: 'room-old', name: 'Old', memberIds: ['agent-claude'], held: [], log: [] }],
        }),
      );
      const restored = new GroupRoomManager({
        roster: new BotRoster(),
        deliver: async () => ok({ text: '' }),
        storagePath: file,
      });
      restored.loadFromDisk();
      assert.deepStrictEqual(restored.get('room-old').data.decisions, []);
    });
  });
});
