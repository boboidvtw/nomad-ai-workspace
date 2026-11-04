const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ShippingLedger, handleShippingRequest, ErrorCodes } = require('../../index');

const HOUR = 3600000;

function setup() {
  let clock = Date.parse('2026-11-05T00:00:00.000Z');
  /** @type {Array<{ type: string, data: any }>} */
  const events = [];
  const ledger = new ShippingLedger({
    storagePath: null,
    now: () => clock,
    onEvent: (type, data) => events.push({ type, data }),
  });
  return {
    ledger,
    events,
    /** @param {number} ms */
    tick: (ms) => {
      clock += ms;
    },
  };
}

/** @param {any} res */
function data(res) {
  assert.strictEqual(res.success, true, `${res.errorCode}: ${res.message}`);
  return res.data;
}

/** @param {any} res @param {string} code */
function fails(res, code) {
  assert.strictEqual(res.success, false, 'expected a failure');
  assert.strictEqual(res.errorCode, code, res.message);
  return res;
}

/**
 * A feature in `verifying` with one required invariant covered by the three proof squares,
 * built by agent-claude and owned by the operator.
 * @param {ShippingLedger} ledger
 */
function verifyingFeature(ledger) {
  const f = data(
    ledger.create({
      title: 'Room decisions',
      problem: 'Members forget decisions',
      outcome: 'Decisions survive the window',
      contract: 'Prompt carries the latest 20 decisions',
      builders: ['agent-claude'],
      risk: 'medium',
    }),
  );
  data(ledger.advance(f.id, { actor: 'operator' }));
  const inv = data(
    ledger.addInvariant(f.id, { text: 'No duplicate decisions', actor: 'operator' }),
  );
  const invariantId = inv.invariants[0].id;
  for (const kind of ['user-path', 'trace', 'release-note']) {
    data(
      ledger.addSquare(f.id, {
        title: `${kind} proof`,
        kind,
        covers: [invariantId],
        owner: 'operator',
        actor: 'operator',
      }),
    );
  }
  data(ledger.advance(f.id, { actor: 'operator' }));
  data(ledger.advance(f.id, { actor: 'operator' }));
  const feature = data(ledger.get(f.id));
  assert.strictEqual(feature.state, 'verifying');
  return feature;
}

/** @param {ShippingLedger} ledger @param {any} feature */
function passAllSquares(ledger, feature) {
  for (const square of feature.squares) {
    data(
      ledger.updateSquare(feature.id, square.id, {
        status: 'passed',
        evidence: `checked ${square.kind}`,
        actor: 'operator',
      }),
    );
  }
}

/** @param {ShippingLedger} ledger @param {any} feature */
function releasingFeature(ledger, feature) {
  passAllSquares(ledger, feature);
  data(ledger.advance(feature.id, { actor: 'operator' }));
  data(
    ledger.planRelease(feature.id, {
      notes: 'Decisions are deduped',
      rollbackPlan: 'Reinstall the backup app',
      baseline: '0 duplicate decisions in 3 rooms',
      approvedBy: 'operator',
      actor: 'operator',
    }),
  );
  data(ledger.advance(feature.id, { actor: 'operator' }));
  return data(ledger.get(feature.id));
}

describe('Shipping ledger - lifecycle gates', () => {
  it('creates a draft and refuses one without a title', () => {
    const { ledger, events } = setup();
    fails(ledger.create({ title: '  ' }), ErrorCodes.SHIPPING_FEATURE_INVALID_001);
    const f = data(ledger.create({ title: 'Calendar view' }));
    assert.strictEqual(f.state, 'draft');
    assert.deepStrictEqual(
      f.events.map((/** @type {any} */ e) => e.type),
      ['created'],
    );
    assert.ok(events.some((e) => e.type === 'shipping:updated'));
  });

  it('needs a problem, outcome and contract to leave draft', () => {
    const { ledger } = setup();
    const f = data(ledger.create({ title: 'Calendar view' }));
    const blocked = fails(
      ledger.advance(f.id, { actor: 'operator' }),
      ErrorCodes.SHIPPING_GATE_BLOCKED_002,
    );
    assert.deepStrictEqual(blocked.details.missing, ['problem', 'outcome', 'contract']);
    data(
      ledger.updateContract(f.id, { problem: 'p', outcome: 'o', contract: 'c', actor: 'operator' }),
    );
    assert.strictEqual(data(ledger.advance(f.id, { actor: 'operator' })).state, 'contract');
  });

  it('needs a builder and an invariant to start building', () => {
    const { ledger } = setup();
    const f = data(ledger.create({ title: 'x', problem: 'p', outcome: 'o', contract: 'c' }));
    data(ledger.advance(f.id, { actor: 'operator' }));
    const blocked = fails(
      ledger.advance(f.id, { actor: 'operator' }),
      ErrorCodes.SHIPPING_GATE_BLOCKED_002,
    );
    assert.deepStrictEqual(blocked.details.missing, ['builder', 'invariant']);
  });

  it('needs every required invariant covered and every required square owned to verify', () => {
    const { ledger } = setup();
    const f = data(
      ledger.create({
        title: 'x',
        problem: 'p',
        outcome: 'o',
        contract: 'c',
        builders: ['agent-claude'],
      }),
    );
    data(ledger.advance(f.id, { actor: 'operator' }));
    const withInv = data(ledger.addInvariant(f.id, { text: 'stays fast', actor: 'operator' }));
    const invId = withInv.invariants[0].id;
    data(ledger.advance(f.id, { actor: 'operator' }));
    let blocked = fails(
      ledger.advance(f.id, { actor: 'operator' }),
      ErrorCodes.SHIPPING_GATE_BLOCKED_002,
    );
    assert.deepStrictEqual(blocked.details.missing, [
      `invariant ${invId} is not covered by a square`,
    ]);

    const withSq = data(
      ledger.addSquare(f.id, { title: 'bench', kind: 'test', covers: [invId], actor: 'operator' }),
    );
    const sqId = withSq.squares[0].id;
    blocked = fails(
      ledger.advance(f.id, { actor: 'operator' }),
      ErrorCodes.SHIPPING_GATE_BLOCKED_002,
    );
    assert.deepStrictEqual(blocked.details.missing, [`square ${sqId} has no owner`]);
  });

  it('needs every required square passed plus user-path, trace and release-note proof to be ready', () => {
    const { ledger } = setup();
    const f = verifyingFeature(ledger);
    const blocked = fails(
      ledger.advance(f.id, { actor: 'operator' }),
      ErrorCodes.SHIPPING_GATE_BLOCKED_002,
    );
    assert.deepStrictEqual(blocked.details.missing, [
      ...f.squares.map((/** @type {any} */ s) => `square ${s.id} has not passed`),
      'no passed user-path square',
      'no passed trace square',
      'no passed release-note square',
    ]);
    passAllSquares(ledger, f);
    assert.strictEqual(data(ledger.advance(f.id, { actor: 'operator' })).state, 'ready');
  });

  it('needs release notes, rollback, baseline and a non-builder approval to release', () => {
    const { ledger } = setup();
    const f = verifyingFeature(ledger);
    passAllSquares(ledger, f);
    data(ledger.advance(f.id, { actor: 'operator' }));
    const blocked = fails(
      ledger.advance(f.id, { actor: 'operator' }),
      ErrorCodes.SHIPPING_GATE_BLOCKED_002,
    );
    assert.deepStrictEqual(blocked.details.missing, [
      'release notes',
      'rollback plan',
      'baseline',
      'approval',
    ]);
    fails(
      ledger.planRelease(f.id, {
        notes: 'n',
        rollbackPlan: 'r',
        baseline: 'b',
        approvedBy: 'agent-claude',
        actor: 'agent-claude',
      }),
      ErrorCodes.SHIPPING_SEPARATION_VIOLATION_005,
    );
    data(
      ledger.planRelease(f.id, {
        notes: 'n',
        rollbackPlan: 'r',
        baseline: 'b',
        approvedBy: 'operator',
        actor: 'operator',
      }),
    );
    assert.strictEqual(data(ledger.advance(f.id, { actor: 'operator' })).state, 'releasing');
  });

  it('moves to watching only through a passed smoke check with evidence', () => {
    const { ledger } = setup();
    const f = releasingFeature(ledger, verifyingFeature(ledger));
    fails(ledger.advance(f.id, { actor: 'operator' }), ErrorCodes.SHIPPING_GATE_BLOCKED_002);
    fails(
      ledger.recordSmoke(f.id, { status: 'passed', evidence: ' ', actor: 'operator' }),
      ErrorCodes.SHIPPING_EVIDENCE_REQUIRED_006,
    );
    const watching = data(
      ledger.recordSmoke(f.id, { status: 'passed', evidence: 'live room ok', actor: 'operator' }),
    );
    assert.strictEqual(watching.state, 'watching');
    assert.deepStrictEqual(watching.readback, {
      dueAt: '2026-11-06T00:00:00.000Z',
      status: 'pending',
      evidence: null,
      by: null,
      at: null,
    });
  });

  it('learns after a passed readback', () => {
    const { ledger, tick } = setup();
    const f = releasingFeature(ledger, verifyingFeature(ledger));
    data(ledger.recordSmoke(f.id, { status: 'passed', evidence: 'ok', actor: 'operator' }));
    tick(24 * HOUR);
    const learned = data(
      ledger.recordReadback(f.id, {
        status: 'passed',
        evidence: '0 duplicates after a day',
        actor: 'operator',
      }),
    );
    assert.strictEqual(learned.state, 'learned');
  });
});

describe('Shipping ledger - evidence squares', () => {
  it('lets no builder pass their own square and requires evidence', () => {
    const { ledger } = setup();
    const f = verifyingFeature(ledger);
    const sq = f.squares[0];
    fails(
      ledger.updateSquare(f.id, sq.id, {
        status: 'passed',
        evidence: 'mine',
        actor: 'agent-claude',
      }),
      ErrorCodes.SHIPPING_SEPARATION_VIOLATION_005,
    );
    fails(
      ledger.updateSquare(f.id, sq.id, { status: 'passed', evidence: '', actor: 'operator' }),
      ErrorCodes.SHIPPING_EVIDENCE_REQUIRED_006,
    );
    const running = data(
      ledger.updateSquare(f.id, sq.id, { status: 'running', actor: 'agent-claude' }),
    );
    assert.strictEqual(running.squares[0].status, 'running');
  });

  it('does not take square results before building', () => {
    const { ledger } = setup();
    const f = data(ledger.create({ title: 'x' }));
    const withSq = data(
      ledger.addSquare(f.id, { title: 's', kind: 'test', owner: 'operator', actor: 'operator' }),
    );
    fails(
      ledger.updateSquare(f.id, withSq.squares[0].id, {
        status: 'passed',
        evidence: 'e',
        actor: 'operator',
      }),
      ErrorCodes.SHIPPING_STATE_INVALID_007,
    );
  });

  it('turns a failed square into friction and a failing regression, and reopens a ready feature', () => {
    const { ledger, events } = setup();
    const f = verifyingFeature(ledger);
    passAllSquares(ledger, f);
    data(ledger.advance(f.id, { actor: 'operator' }));
    const sq = f.squares[0];
    const back = data(
      ledger.updateSquare(f.id, sq.id, {
        status: 'failed',
        evidence: 'dup decision seen',
        actor: 'operator',
        command: 'npm test --workspace @nomad/core',
        expected: 'no duplicates',
      }),
    );
    assert.strictEqual(back.state, 'verifying');
    const board = ledger.board();
    assert.deepStrictEqual(
      board.friction.map((x) => [x.featureId, x.severity, x.status, x.source]),
      [[f.id, 'high', 'open', `square:${sq.id}`]],
    );
    assert.deepStrictEqual(
      board.regressions.map((r) => [r.featureId, r.status, r.command, r.expected]),
      [[f.id, 'failing', 'npm test --workspace @nomad/core', 'no duplicates']],
    );
    assert.ok(events.some((e) => e.type === 'shipping:friction'));
  });

  it('passes a square when the linked task is approved through the review gate', () => {
    const { ledger } = setup();
    const f = verifyingFeature(ledger);
    const sq = f.squares[0];
    data(ledger.linkTask(f.id, sq.id, { taskId: 'task_1', actor: 'operator' }));
    ledger.onTaskEvent('task:approved', {
      id: 'task_1',
      reviewGate: { reviewer: 'operator', proposal: 'Ran the room', feedback: 'looks right' },
    });
    const square = data(ledger.get(f.id)).squares[0];
    assert.strictEqual(square.status, 'passed');
    assert.strictEqual(square.by, 'operator');
    assert.match(square.evidence, /Ran the room/);
    assert.match(square.evidence, /looks right/);
  });

  it('ignores an approval from a builder and fails the square on rejection', () => {
    const { ledger } = setup();
    const f = verifyingFeature(ledger);
    const [a, b] = f.squares;
    data(ledger.linkTask(f.id, a.id, { taskId: 'task_a', actor: 'operator' }));
    data(ledger.linkTask(f.id, b.id, { taskId: 'task_b', actor: 'operator' }));
    ledger.onTaskEvent('task:approved', {
      id: 'task_a',
      reviewGate: { reviewer: 'agent-claude', proposal: 'self' },
    });
    ledger.onTaskEvent('task:rejected', {
      id: 'task_b',
      reviewGate: { reviewer: 'operator', feedback: 'wrong output' },
    });
    const after = data(ledger.get(f.id));
    assert.strictEqual(after.squares[0].status, 'open');
    assert.strictEqual(after.squares[1].status, 'failed');
    assert.ok(after.events.some((/** @type {any} */ e) => e.type === 'task-link-refused'));
  });
});

describe('Shipping ledger - release, readback and side states', () => {
  it('sends a failed smoke check back to building with high friction and reopened squares', () => {
    const { ledger } = setup();
    const f = releasingFeature(ledger, verifyingFeature(ledger));
    const back = data(
      ledger.recordSmoke(f.id, { status: 'failed', evidence: 'app crashed', actor: 'operator' }),
    );
    assert.strictEqual(back.state, 'building');
    assert.ok(back.squares.every((/** @type {any} */ s) => s.status === 'open'));
    assert.strictEqual(back.release, null);
    assert.deepStrictEqual(
      ledger.board().friction.map((x) => x.severity),
      ['high'],
    );
  });

  it('sends a failed readback back to building with critical friction', () => {
    const { ledger } = setup();
    const f = releasingFeature(ledger, verifyingFeature(ledger));
    data(ledger.recordSmoke(f.id, { status: 'passed', evidence: 'ok', actor: 'operator' }));
    const back = data(
      ledger.recordReadback(f.id, { status: 'failed', evidence: 'dups back', actor: 'operator' }),
    );
    assert.strictEqual(back.state, 'building');
    assert.strictEqual(back.readback, null);
    assert.deepStrictEqual(
      ledger.board().friction.map((x) => x.severity),
      ['critical'],
    );
  });

  it('holds learned while a regression of the feature is failing', () => {
    const { ledger, tick } = setup();
    const f = releasingFeature(ledger, verifyingFeature(ledger));
    const reg = data(
      ledger.addRegression(f.id, {
        title: 'dup check',
        command: 'npm test',
        expected: 'pass',
        actor: 'operator',
      }),
    );
    data(
      ledger.updateRegression(reg.id, { status: 'failing', actor: 'operator', evidence: 'red' }),
    );
    data(ledger.recordSmoke(f.id, { status: 'passed', evidence: 'ok', actor: 'operator' }));
    tick(24 * HOUR);
    const held = data(
      ledger.recordReadback(f.id, { status: 'passed', evidence: 'fine', actor: 'operator' }),
    );
    assert.strictEqual(held.state, 'watching');
    const blocked = fails(
      ledger.advance(f.id, { actor: 'operator' }),
      ErrorCodes.SHIPPING_GATE_BLOCKED_002,
    );
    assert.deepStrictEqual(blocked.details.missing, [`regression ${reg.id} is failing`]);
    data(
      ledger.updateRegression(reg.id, { status: 'passing', actor: 'operator', evidence: 'green' }),
    );
    assert.strictEqual(data(ledger.advance(f.id, { actor: 'operator' })).state, 'learned');
  });

  it('marks a missed readback overdue once', () => {
    const { ledger, tick } = setup();
    const f = releasingFeature(ledger, verifyingFeature(ledger));
    data(ledger.recordSmoke(f.id, { status: 'passed', evidence: 'ok', actor: 'operator' }));
    tick(23 * HOUR);
    assert.deepStrictEqual(ledger.markOverdue(), []);
    tick(2 * HOUR);
    assert.deepStrictEqual(ledger.markOverdue(), [f.id]);
    assert.deepStrictEqual(ledger.markOverdue(), []);
    assert.strictEqual(data(ledger.get(f.id)).readback.status, 'overdue');
    assert.deepStrictEqual(
      ledger.board().friction.map((x) => x.severity),
      ['medium'],
    );
  });

  it('pauses, refuses to advance while paused, resumes and archives', () => {
    const { ledger } = setup();
    const f = data(ledger.create({ title: 'x', problem: 'p', outcome: 'o', contract: 'c' }));
    const paused = data(ledger.pause(f.id, { actor: 'operator' }));
    assert.strictEqual(paused.state, 'paused');
    assert.strictEqual(paused.pausedFrom, 'draft');
    fails(ledger.advance(f.id, { actor: 'operator' }), ErrorCodes.SHIPPING_STATE_INVALID_007);
    assert.strictEqual(data(ledger.resume(f.id, { actor: 'operator' })).state, 'draft');
    assert.strictEqual(data(ledger.archive(f.id, { actor: 'operator' })).state, 'archived');
    fails(ledger.resume(f.id, { actor: 'operator' }), ErrorCodes.SHIPPING_STATE_INVALID_007);
  });

  it('records every change as an append-only event', () => {
    const { ledger } = setup();
    const f = releasingFeature(ledger, verifyingFeature(ledger));
    const types = data(ledger.get(f.id)).events.map((/** @type {any} */ e) => e.type);
    assert.deepStrictEqual(types, [
      'created',
      'state',
      'invariant',
      'square',
      'square',
      'square',
      'state',
      'state',
      'square-result',
      'square-result',
      'square-result',
      'state',
      'release-plan',
      'state',
    ]);
  });
});

describe('Shipping ledger - board, calendar and storage', () => {
  it('orders the portfolio by active risk, then state, then update time', () => {
    const { ledger, tick } = setup();
    const low = data(ledger.create({ title: 'low', risk: 'low' }));
    tick(1000);
    const high = data(ledger.create({ title: 'high', risk: 'high' }));
    tick(1000);
    const quiet = data(ledger.create({ title: 'quiet', risk: 'low' }));
    data(
      ledger.addFriction({
        featureId: quiet.id,
        title: 'users stuck',
        severity: 'critical',
        actor: 'operator',
      }),
    );
    assert.deepStrictEqual(
      ledger.board().features.map((x) => x.title),
      ['quiet', 'high', 'low'],
    );
    assert.strictEqual(ledger.board().features[0].activeRisk, 'critical');
    assert.ok(low && high);
  });

  it('lists readback due dates and targets for the calendar', () => {
    const { ledger } = setup();
    const f = releasingFeature(ledger, verifyingFeature(ledger));
    data(ledger.recordSmoke(f.id, { status: 'passed', evidence: 'ok', actor: 'operator' }));
    data(ledger.create({ title: 'Calendar view', target: '2026-11-20T00:00:00.000Z' }));
    assert.deepStrictEqual(
      ledger.calendarEntries('2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z'),
      [
        {
          kind: 'readback',
          at: '2026-11-06T00:00:00.000Z',
          title: 'Room decisions',
          featureId: f.id,
          status: 'pending',
        },
        {
          kind: 'target',
          at: '2026-11-20T00:00:00.000Z',
          title: 'Calendar view',
          featureId: ledger.board().features.find((x) => x.title === 'Calendar view')?.id,
          status: 'draft',
        },
      ],
    );
  });

  it('persists and reloads the ledger', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-shipping-'));
    const file = path.join(dir, 'shipping.json');
    const ledger = new ShippingLedger({ storagePath: file });
    const f = data(ledger.create({ title: 'Persist me', risk: 'high' }));
    data(
      ledger.addFriction({ featureId: null, title: 'general', severity: 'low', actor: 'operator' }),
    );
    const restored = new ShippingLedger({ storagePath: file });
    data(restored.loadFromDisk());
    assert.strictEqual(data(restored.get(f.id)).title, 'Persist me');
    assert.strictEqual(restored.board().friction.length, 1);
    assert.strictEqual((fs.statSync(file).mode & 0o777).toString(8), '600');
  });

  it('picks up writes another process made to the same file (daemon and Studio)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-shipping-'));
    const file = path.join(dir, 'shipping.json');
    const studio = new ShippingLedger({ storagePath: file });
    const daemon = new ShippingLedger({ storagePath: file });
    data(studio.loadFromDisk());
    data(daemon.loadFromDisk());
    const a = data(studio.create({ title: 'From Studio' }));
    // A later mtime, as a write from the other process would leave.
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(file, later, later);
    const b = data(daemon.create({ title: 'From daemon' }));
    assert.strictEqual(data(daemon.get(a.id)).title, 'From Studio', 'daemon saw the Studio write');
    fs.utimesSync(file, new Date(Date.now() + 10000), new Date(Date.now() + 10000));
    assert.strictEqual(data(studio.get(b.id)).title, 'From daemon', 'Studio saw the daemon write');
    assert.strictEqual(studio.board().features.length, 2);
  });
});

describe('Shipping API - /api/shipping', () => {
  /** @param {ShippingLedger} ledger */
  function call(ledger) {
    /** @param {string} method @param {string} pathname @param {any} [body] */
    return (method, pathname, body) =>
      handleShippingRequest({
        method,
        pathname,
        searchParams: new URLSearchParams(),
        readBody: async () => body || {},
        services: { shipping: ledger },
      });
  }

  it('drives a feature through its gates and maps failures to HTTP statuses', async () => {
    const { ledger } = setup();
    const api = call(ledger);
    assert.strictEqual(await api('GET', '/api/tasks'), null);

    const created = await api('POST', '/api/shipping', { title: 'API feature' });
    assert.strictEqual(created?.status, 200);
    const id = created?.payload.data.id;

    assert.strictEqual(
      (await api('POST', `/api/shipping/${id}/advance`, { actor: 'operator' }))?.status,
      409,
    );
    assert.strictEqual(
      (await api('PATCH', `/api/shipping/${id}`, { problem: 'p', outcome: 'o', contract: 'c' }))
        ?.status,
      200,
    );
    assert.strictEqual(
      (await api('POST', `/api/shipping/${id}/advance`, {}))?.payload.data.state,
      'contract',
    );
    assert.strictEqual((await api('GET', '/api/shipping/nope'))?.status, 404);

    const board = await api('GET', '/api/shipping');
    assert.strictEqual(board?.payload.data.features.length, 1);

    const friction = await api('POST', '/api/shipping/friction', {
      title: 'slow',
      severity: 'low',
    });
    assert.strictEqual(friction?.status, 200);
    const frictionId = friction?.payload.data.id;
    const resolved = await api('POST', `/api/shipping/friction/${frictionId}/resolve`, {});
    assert.strictEqual(resolved?.payload.data.status, 'resolved');
    assert.strictEqual((await api('DELETE', '/api/shipping'))?.status, 405);
  });
});

describe('Shipping ledger - review fixes', () => {
  const { gateMissing } = require('../shipping/shipping-model');

  it('freezes the builder list once building starts', () => {
    const { ledger } = setup();
    const f = verifyingFeature(ledger);
    fails(
      ledger.updateContract(f.id, { builders: [], actor: 'operator' }),
      ErrorCodes.SHIPPING_STATE_INVALID_007,
    );
    assert.strictEqual(
      data(ledger.updateContract(f.id, { problem: 'clearer', actor: 'operator' })).problem,
      'clearer',
    );
  });

  it('takes no new squares once ready, and reopening a square leaves ready', () => {
    const { ledger } = setup();
    const f = verifyingFeature(ledger);
    passAllSquares(ledger, f);
    data(ledger.advance(f.id, { actor: 'operator' }));
    fails(
      ledger.addSquare(f.id, { title: 'late', kind: 'test', owner: 'operator', actor: 'operator' }),
      ErrorCodes.SHIPPING_STATE_INVALID_007,
    );
    const back = data(
      ledger.updateSquare(f.id, f.squares[0].id, { status: 'running', actor: 'operator' }),
    );
    assert.strictEqual(back.state, 'verifying');
  });

  it('re-checks earlier gates at every later gate', () => {
    const { ledger } = setup();
    const f = verifyingFeature(ledger);
    const pretend = {
      ...f,
      state: 'ready',
      release: {
        notes: 'n',
        rollbackPlan: 'r',
        baseline: 'b',
        approvedBy: 'operator',
        approvedAt: null,
        smoke: null,
      },
    };
    const missing = gateMissing(pretend, 'releasing', { failingRegressionIds: [] });
    assert.ok(missing.includes(`square ${f.squares[0].id} has not passed`), missing.join('; '));
  });

  it('records an approval only from the approver themself', () => {
    const { ledger } = setup();
    const f = verifyingFeature(ledger);
    passAllSquares(ledger, f);
    data(ledger.advance(f.id, { actor: 'operator' }));
    fails(
      ledger.planRelease(f.id, {
        notes: 'n',
        rollbackPlan: 'r',
        baseline: 'b',
        approvedBy: 'alice',
        actor: 'operator',
      }),
      ErrorCodes.SHIPPING_SEPARATION_VIOLATION_005,
    );
  });

  it('does not pile up friction and regressions when the same square fails again', () => {
    const { ledger } = setup();
    const f = verifyingFeature(ledger);
    const sq = f.squares[0];
    for (const evidence of ['first', 'second']) {
      data(ledger.updateSquare(f.id, sq.id, { status: 'failed', evidence, actor: 'operator' }));
    }
    const board = ledger.board();
    assert.strictEqual(board.friction.length, 1);
    assert.strictEqual(board.regressions.length, 1);
    assert.strictEqual(board.regressions[0].evidence, 'second');
  });

  it('refuses a passed readback before it is due', () => {
    const { ledger, tick } = setup();
    const f = releasingFeature(ledger, verifyingFeature(ledger));
    data(ledger.recordSmoke(f.id, { status: 'passed', evidence: 'ok', actor: 'operator' }));
    fails(
      ledger.recordReadback(f.id, { status: 'passed', evidence: 'too early', actor: 'operator' }),
      ErrorCodes.SHIPPING_GATE_BLOCKED_002,
    );
    tick(24 * HOUR);
    assert.strictEqual(
      data(
        ledger.recordReadback(f.id, {
          status: 'passed',
          evidence: 'a day later',
          actor: 'operator',
        }),
      ).state,
      'learned',
    );
  });

  it('backs up an unreadable file and keeps working', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-shipping-'));
    const file = path.join(dir, 'shipping.json');
    fs.writeFileSync(file, '{ not json');
    const ledger = new ShippingLedger({ storagePath: file });
    fails(ledger.loadFromDisk(), ErrorCodes.SHIPPING_STORAGE_FAILED_008);
    data(ledger.create({ title: 'after corruption' }));
    const backups = fs.readdirSync(dir).filter((n) => n.startsWith('shipping.json.corrupt-'));
    assert.strictEqual(backups.length, 1);
    assert.strictEqual(fs.readFileSync(path.join(dir, backups[0]), 'utf8'), '{ not json');
    assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).features.length, 1);
  });

  it('drops malformed features when loading', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-shipping-'));
    const file = path.join(dir, 'shipping.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        features: [{ id: 'feat-bad', title: 'x', squares: 'nope' }, null],
        friction: [],
        regressions: [],
      }),
    );
    const ledger = new ShippingLedger({ storagePath: file });
    data(ledger.loadFromDisk());
    assert.strictEqual(ledger.board().features.length, 0);
    assert.deepStrictEqual(ledger.markOverdue(), []);
  });

  it('answers unknown actions, prototype keys and null bodies without throwing', async () => {
    const { ledger } = setup();
    const f = data(ledger.create({ title: 'x' }));
    /** @param {string} p @param {any} body */
    const post = (p, body) =>
      handleShippingRequest({
        method: 'POST',
        pathname: p,
        searchParams: new URLSearchParams(),
        readBody: async () => body,
        services: { shipping: ledger },
      });
    assert.strictEqual((await post(`/api/shipping/${f.id}/__proto__`, {}))?.status, 404);
    assert.strictEqual((await post(`/api/shipping/${f.id}/constructor`, {}))?.status, 404);
    assert.strictEqual((await post(`/api/shipping/${f.id}/advance`, null))?.status, 409);
    assert.strictEqual((await post('/api/shipping', null))?.status, 400);
  });
});
