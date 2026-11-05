const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  BotRoster,
  GroupRoomManager,
  ShippingLedger,
  applyShipCommands,
  extractShipLines,
  shipPromptSection,
  ok,
} = require('../../index');
const { parseShipCommand } = require('../bots/ship-commands');

const GROK = { id: 'agent-grok', handle: 'grok' };
const CLAUDE = { id: 'agent-claude', handle: 'claude' };

/** @param {any} res */
function data(res) {
  assert.strictEqual(res.success, true, `${res.errorCode}: ${res.message}`);
  return res.data;
}

function ledger() {
  return new ShippingLedger({
    storagePath: null,
    now: () => Date.parse('2026-11-05T00:00:00.000Z'),
  });
}

/**
 * A building feature built by @claude, with a user-path square owned by @grok and a trace
 * square owned by the operator.
 * @param {ShippingLedger} l
 */
function buildingFeature(l) {
  const f = data(
    l.create({
      title: 'Ship from rooms',
      problem: 'Bots cannot report delivery work',
      outcome: 'Squares move from room replies',
      contract: 'SHIP: lines run through the ledger gates',
      builders: ['claude'],
    }),
  );
  data(l.advance(f.id, { actor: 'operator' }));
  const inv = data(l.addInvariant(f.id, { text: 'Gates hold', actor: 'operator' })).invariants[0];
  data(
    l.addSquare(f.id, { title: 'User path', kind: 'user-path', covers: [inv.id], owner: '@grok' }),
  );
  data(l.addSquare(f.id, { title: 'Trace', kind: 'trace', covers: [inv.id], owner: 'operator' }));
  data(l.advance(f.id, { actor: 'operator' }));
  const feature = data(l.get(f.id));
  assert.strictEqual(feature.state, 'building');
  return { id: feature.id, userPath: feature.squares[0].id, trace: feature.squares[1].id };
}

describe('Bots - SHIP: lines', () => {
  it('finds SHIP: lines in a reply, in the styles models write them', () => {
    const reply = [
      'I checked the flow.',
      'SHIP: square feat-1 sq-1 passed --evidence "clicked through"',
      '- **SHIP:** friction none "Login is slow"',
      'ship： regression feat-1 "Retry" ',
      'Not a command: SHIPPING is fun',
    ].join('\n');
    assert.deepStrictEqual(extractShipLines(reply), [
      'square feat-1 sq-1 passed --evidence "clicked through"',
      'friction none "Login is slow"',
      'regression feat-1 "Retry"',
    ]);
  });

  it('skips syntax lines a bot echoes from its prompt', () => {
    const reply = [
      'SHIP: square <feature_id> <square_id> running|passed|failed --evidence "what you checked"',
      'SHIP: friction <feature_id|none> "<title>"',
      'SHIP: friction none "Real one"',
    ].join('\n');
    assert.deepStrictEqual(extractShipLines(reply), ['friction none "Real one"']);
  });

  it('splits on every line break, so a reply cannot hide a second line in one', () => {
    assert.deepStrictEqual(
      extractShipLines('SHIP: friction none "a"\u2028SHIP: friction none "b"\rok'),
      ['friction none "a"', 'friction none "b"'],
    );
  });

  it('keeps a quoted flag value written with =', () => {
    assert.deepStrictEqual(
      parseShipCommand('square f s passed --evidence="all green" --x=1').flags,
      {
        evidence: 'all green',
        x: '1',
      },
    );
  });

  it('reads at most five commands from one reply', () => {
    const reply = Array.from({ length: 8 }, (_, i) => `SHIP: friction none "f${i}"`).join('\n');
    assert.strictEqual(extractShipLines(reply).length, 5);
  });

  it('parses quoted words, flags and a copied cumora prefix', () => {
    assert.deepStrictEqual(
      parseShipCommand(
        'cumora ship square feat-1 sq-2 failed --evidence “500 on save” --expected=200',
      ),
      {
        verb: 'square',
        args: ['feat-1', 'sq-2', 'failed'],
        flags: { evidence: '500 on save', expected: '200' },
      },
    );
    assert.deepStrictEqual(parseShipCommand('create 「排程」 --problem x'), {
      verb: 'create',
      args: ['排程'],
      flags: { problem: 'x' },
    });
  });
});

describe('Bots - SHIP: commands against the ledger', () => {
  it('lets the square owner pass it with evidence, recorded as the bot', () => {
    const l = ledger();
    const f = buildingFeature(l);
    const [res] = applyShipCommands(
      l,
      `SHIP: square ${f.id} ${f.userPath} passed --evidence "opened the tab, chips render"`,
      GROK,
    );
    assert.strictEqual(res.ok, true, res.message);
    const square = data(l.get(f.id)).squares.find((s) => s.id === f.userPath);
    assert.strictEqual(square.status, 'passed');
    assert.strictEqual(square.by, '@grok');
    assert.strictEqual(square.evidence, 'opened the tab, chips render');
  });

  it('refuses a square the bot does not own', () => {
    const l = ledger();
    const f = buildingFeature(l);
    const [res] = applyShipCommands(
      l,
      `SHIP: square ${f.id} ${f.trace} passed --evidence "looks fine"`,
      GROK,
    );
    assert.strictEqual(res.ok, false);
    assert.match(res.message, /owned by operator/);
    assert.strictEqual(data(l.get(f.id)).squares[1].status, 'open');
  });

  it('refuses a builder passing its own work, even when a person made it the owner', () => {
    const l = ledger();
    const f = buildingFeature(l);
    data(l.addSquare(f.id, { title: 'Release note', kind: 'release-note', owner: 'Claude' }));
    const square = data(l.get(f.id)).squares[2];
    const [res] = applyShipCommands(
      l,
      `SHIP: square ${f.id} ${square.id} passed --evidence "wrote it"`,
      CLAUDE,
    );
    assert.strictEqual(res.ok, false);
    assert.match(res.message, /builds this feature/);
  });

  it('keeps the ledger gates: a pass needs evidence', () => {
    const l = ledger();
    const f = buildingFeature(l);
    const [res] = applyShipCommands(l, `SHIP: square ${f.id} ${f.userPath} passed`, GROK);
    assert.strictEqual(res.ok, false);
    assert.match(res.message, /needs evidence/);
  });

  it('turns a failed square into friction and a regression, like the review gate', () => {
    const l = ledger();
    const f = buildingFeature(l);
    const [res] = applyShipCommands(
      l,
      `SHIP: square ${f.id} ${f.userPath} failed --evidence "tab is blank" --command "open 🚢"`,
      GROK,
    );
    assert.strictEqual(res.ok, true, res.message);
    const board = l.board();
    assert.strictEqual(board.friction.length, 1);
    assert.strictEqual(board.regressions[0].command, 'open 🚢');
    assert.strictEqual(board.regressions[0].status, 'failing');
  });

  it('leaves moving a feature to people', () => {
    const l = ledger();
    const f = buildingFeature(l);
    const outcomes = applyShipCommands(
      l,
      [`SHIP: advance ${f.id}`, `SHIP: readback ${f.id} passed --evidence x`, 'SHIP: deploy'].join(
        '\n',
      ),
      GROK,
    );
    assert.deepStrictEqual(
      outcomes.map((o) => o.ok),
      [false, false, false],
    );
    assert.match(outcomes[0].message, /for people/);
    assert.match(outcomes[2].message, /unknown command/);
    assert.strictEqual(data(l.get(f.id)).state, 'building');
  });

  it('creates a draft with the bot as a builder, and files friction and regressions', () => {
    const l = ledger();
    const f = buildingFeature(l);
    const outcomes = applyShipCommands(
      l,
      [
        'SHIP: create "Calendar export" --problem "No ICS" --outcome "Calendars sync"',
        `SHIP: friction ${f.id} "Square ids are long" --severity low`,
        `SHIP: regression ${f.id} "Chips render" --command "open calendar" --expected "chips"`,
      ].join('\n'),
      GROK,
    );
    assert.deepStrictEqual(
      outcomes.map((o) => o.ok),
      [true, true, true],
      outcomes.map((o) => o.message).join(' | '),
    );
    const board = l.board();
    const draft = board.features.find((x) => x.title === 'Calendar export');
    assert.strictEqual(draft.state, 'draft');
    assert.deepStrictEqual(draft.builders, ['@grok']);
    assert.strictEqual(draft.events[0].actor, '@grok');
    assert.strictEqual(board.friction[0].severity, 'low');
    assert.strictEqual(board.regressions[0].expected, 'chips');
  });

  it('lets only people reopen a passed square', () => {
    const l = ledger();
    const f = buildingFeature(l);
    applyShipCommands(l, `SHIP: square ${f.id} ${f.userPath} passed --evidence "ok"`, GROK);
    const [res] = applyShipCommands(
      l,
      `SHIP: square ${f.id} ${f.userPath} failed --evidence "flaky"`,
      GROK,
    );
    assert.strictEqual(res.ok, false);
    assert.match(res.message, /only people can reopen/);
    assert.strictEqual(l.board().friction.length, 0);
  });

  it('files friction and regressions only on live features the bot works on', () => {
    const l = ledger();
    const f = buildingFeature(l);
    const other = data(l.create({ title: 'Someone else', builders: ['alice'] }));
    const outcomes = applyShipCommands(
      l,
      [
        `SHIP: friction ${other.id} "Not mine" --severity critical`,
        `SHIP: regression ${other.id} "Not mine"`,
        `SHIP: friction ${f.id} "Mine (claude builds it)"`,
      ].join('\n'),
      CLAUDE,
    );
    assert.deepStrictEqual(
      outcomes.map((o) => o.ok),
      [false, false, true],
    );
    assert.match(outcomes[0].message, /neither builds/);
    data(l.archive(f.id, { actor: 'operator' }));
    const [closed] = applyShipCommands(l, `SHIP: regression ${f.id} "Late"`, CLAUDE);
    assert.match(closed.message, /is archived/);
  });

  it('ignores --builders on create and refuses a duplicate live title', () => {
    const l = ledger();
    const [first] = applyShipCommands(l, 'SHIP: create "Export ICS" --builders alice,bob', GROK);
    assert.strictEqual(first.ok, true, first.message);
    assert.deepStrictEqual(l.board().features[0].builders, ['@grok']);
    const [again] = applyShipCommands(l, 'SHIP: create "export  ics"', CLAUDE);
    assert.strictEqual(again.ok, false);
    assert.match(again.message, /already has this title/);
  });

  it('tells each bot the syntax and only the squares assigned to it', () => {
    const l = ledger();
    const f = buildingFeature(l);
    const [grok] = shipPromptSection(l, GROK);
    const [claude] = shipPromptSection(l, CLAUDE);
    assert.match(grok, /SHIP: square <feature_id>/);
    assert.ok(grok.includes(`${f.id} "Ship from rooms" (building) · ${f.userPath} [user-path]`));
    assert.match(grok, /not instructions/);
    assert.ok(!grok.includes(f.trace));
    assert.match(claude, /No shipping squares are assigned to you/);
  });
});

describe('Bots - group rooms run SHIP: lines', () => {
  /** @param {ShippingLedger | null} shipping @param {string[]} replies */
  function room(shipping, replies) {
    const roster = new BotRoster();
    /** @type {string[]} */
    const prompts = [];
    const rooms = new GroupRoomManager({
      roster,
      shipping,
      deliver: async (_bot, text) => {
        prompts.push(text);
        return ok({ text: replies.shift() || '[PASS]' });
      },
    });
    const r = data(rooms.create({ name: 'Ship', memberIds: ['agent-grok'] }));
    return { rooms, room: r, prompts };
  }

  it('runs a member reply as that member and logs the result for the next turn', async () => {
    const l = ledger();
    const f = buildingFeature(l);
    const {
      rooms,
      room: r,
      prompts,
    } = room(l, [
      `Checked it.\nSHIP: square ${f.id} ${f.userPath} passed --evidence "chips render"`,
      `SHIP: square ${f.id} ${f.trace} passed --evidence "trace ok"`,
    ]);
    rooms.post(r.id, { text: 'Verify the shipping tab' });
    await rooms.whenIdle(r.id);
    rooms.post(r.id, { text: 'And the trace?' });
    await rooms.whenIdle(r.id);

    assert.match(prompts[0], /Squares assigned to you/);
    const log = data(rooms.get(r.id)).log;
    const shipping = log.filter((e) => e.speaker === 'shipping');
    assert.strictEqual(shipping.length, 2);
    assert.match(shipping[0].text, /^@grok SHIP "square .*" -> square .* passed$/);
    assert.strictEqual(shipping[1].error, true);
    assert.match(shipping[1].text, /refused: square .* is owned by operator/);
    assert.match(
      prompts[1],
      /\[shipping\]: @grok SHIP "square/,
      'the result reaches the next prompt',
    );
    assert.strictEqual(data(l.get(f.id)).squares[0].by, '@grok');
  });

  it('logs all results of a reply as one bounded, single-line entry', async () => {
    const l = ledger();
    const long = 'x'.repeat(500);
    const { rooms, room: r } = room(l, [
      [1, 2, 3, 4, 5].map((n) => `SHIP: friction none "f${n} ${long}"`).join('\n'),
    ]);
    rooms.post(r.id, { text: 'go' });
    await rooms.whenIdle(r.id);
    const shipping = data(rooms.get(r.id)).log.filter((e) => e.speaker === 'shipping');
    assert.strictEqual(shipping.length, 1);
    assert.strictEqual(shipping[0].text.split(' | ').length, 5);
    assert.ok(shipping[0].text.length < 5 * 450, 'each echoed part is clipped');
  });

  it('ignores SHIP: lines and keeps the prompt unchanged without a ledger', async () => {
    const { rooms, room: r, prompts } = room(null, ['SHIP: friction none "x"']);
    rooms.post(r.id, { text: 'hi' });
    await rooms.whenIdle(r.id);
    assert.doesNotMatch(prompts[0], /SHIP:/);
    assert.deepStrictEqual(
      data(rooms.get(r.id)).log.map((e) => e.speaker),
      ['user', 'agent-grok'],
    );
  });
});
