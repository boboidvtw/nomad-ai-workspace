/**
 * Nomad Shared Core - Shipping ledger
 * Owns every shipping gate (the UI and API cannot bypass them), keeps an append-only event log per
 * feature, and turns failed verification into friction and regression items. Local-first port of
 * Cumora docs/SHIPPING.md (MIT): one machine, one file, no multi-replica worker.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const os = require('node:os');
const path = require('node:path');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const M = require('./shipping-model');
const { ShippingSignals } = require('./shipping-signals');
const { ShippingStore } = require('./shipping-store');

const DEFAULT_SHIPPING_PATH = path.join(os.homedir(), '.nomad', 'shipping.json');
const MAX_EVENTS_PER_FEATURE = 500;
const OVERDUE_CHECK_MS = 60000;
const TERMINAL = [M.SHIP_STATE.LEARNED, M.SHIP_STATE.ARCHIVED];

/** @typedef {import('./shipping-model').Feature} Feature */
/** @typedef {import('./shipping-model').Friction} Friction */
/** @typedef {import('./shipping-model').Regression} Regression */
/** @typedef {import('./shipping-model').ShipState} ShipState */
/** @typedef {{ actor?: string }} Acting */

const { newId, actorOf, invalid } = M;

/** @param {string} message */
function wrongState(message) {
  return err(ErrorCodes.SHIPPING_STATE_INVALID_007, message);
}

/** Where a feature stands on the main path; a paused feature counts as where it paused. */
function flowIndex(/** @type {Feature} */ feature) {
  const state = feature.state === M.SHIP_STATE.PAUSED ? feature.pausedFrom : feature.state;
  return M.SHIP_FLOW.indexOf(/** @type {any} */ (state));
}

/** @param {import('./shipping-model').EvidenceSquare} square */
function reopened(square) {
  return { ...square, status: /** @type {const} */ ('open'), evidence: null, by: null, at: null };
}

class ShippingLedger {
  /**
   * @param {Object} [options]
   * @param {string | null} [options.storagePath] - null keeps the ledger in memory
   * @param {() => number} [options.now]
   * @param {(type: string, data: unknown) => void} [options.onEvent]
   */
  constructor(options = {}) {
    this.storagePath =
      options.storagePath === undefined ? DEFAULT_SHIPPING_PATH : options.storagePath;
    this.now = options.now || Date.now;
    this.onEvent = options.onEvent || null;
    /** @type {Map<string, Feature>} */
    this.features = new Map();
    this.store = new ShippingStore(this.storagePath, () => this.now());
    this.signals = new ShippingSignals({
      now: () => this.now(),
      hasFeature: (id) => this.features.has(id),
      persist: () => this.persist(),
      emit: (type, data) => this.emit(type, data),
    });
    /** @type {NodeJS.Timeout | null} */
    this.timer = null;
  }

  get friction() {
    return this.signals.friction;
  }

  get regressions() {
    return this.signals.regressions;
  }

  /** The daemon and the Studio each hold a ledger on the same file: reload when the other wrote. */
  refresh() {
    if (this.store.changed()) this.loadFromDisk();
  }

  iso() {
    return new Date(this.now()).toISOString();
  }

  // ---------------------------------------------------------------- features

  /**
   * @param {{ title?: string, problem?: string, outcome?: string, contract?: string, builders?: string[], priority?: string, risk?: string, target?: string | null } & Acting} input
   */
  create(input) {
    this.refresh();
    const title = M.text(input?.title);
    if (!title) return invalid('A feature needs a title');
    const fields = M.contractFields(input || {});
    if (!fields.success) return fields;
    const at = this.iso();
    /** @type {Feature} */
    const feature = {
      id: newId('feat'),
      title,
      problem: '',
      outcome: '',
      contract: '',
      priority: 'medium',
      risk: 'medium',
      target: null,
      builders: [],
      ...fields.data,
      state: M.SHIP_STATE.DRAFT,
      pausedFrom: null,
      invariants: [],
      squares: [],
      release: null,
      readback: null,
      events: [{ at, actor: actorOf(input), type: 'created', detail: title }],
      createdAt: at,
      updatedAt: at,
    };
    return this.save(feature);
  }

  /** @param {string} id @param {Record<string, unknown> & Acting} input */
  updateContract(id, input) {
    const found = this.active(id);
    if (!found.success) return found;
    const fields = M.contractFields(input || {});
    if (!fields.success) return fields;
    if (fields.data.builders && flowIndex(found.data) >= M.SHIP_FLOW.indexOf('building')) {
      return wrongState('Builders are fixed once building starts');
    }
    const changed = Object.keys(fields.data).join(', ') || 'nothing';
    return this.commit(found.data, fields.data, input, 'contract', changed);
  }

  /** @param {string} id @param {{ text?: string, required?: boolean } & Acting} input */
  addInvariant(id, input) {
    const found = this.active(id);
    if (!found.success) return found;
    const invText = M.text(input?.text);
    if (!invText) return invalid('An invariant needs text');
    const invariant = { id: newId('inv'), text: invText, required: input.required !== false };
    const invariants = [...found.data.invariants, invariant];
    return this.commit(found.data, { invariants }, input, 'invariant', invText);
  }

  /**
   * @param {string} id
   * @param {{ title?: string, kind?: string, covers?: string[], owner?: string | null, required?: boolean, taskId?: string | null } & Acting} input
   */
  addSquare(id, input) {
    const found = this.active(id);
    if (!found.success) return found;
    const feature = found.data;
    if (flowIndex(feature) >= M.SHIP_FLOW.indexOf('ready')) {
      return wrongState('Add squares before the feature is ready');
    }
    const title = M.text(input?.title);
    const kind = M.text(input?.kind) || 'test';
    if (!title) return invalid('A square needs a title');
    if (!M.SQUARE_KINDS.includes(kind)) return invalid(`Unknown square kind "${kind}"`);
    const covers = M.textList(input.covers);
    const unknown = covers.find((c) => !feature.invariants.some((i) => i.id === c));
    if (unknown) return invalid(`Square covers unknown invariant ${unknown}`);
    /** @type {import('./shipping-model').EvidenceSquare} */
    const square = {
      id: newId('sq'),
      title,
      kind,
      covers,
      owner: M.text(input.owner) || null,
      required: input.required !== false,
      status: 'open',
      evidence: null,
      by: null,
      at: null,
      taskId: M.text(input.taskId) || null,
    };
    return this.commit(feature, { squares: [...feature.squares, square] }, input, 'square', title);
  }

  /** @param {string} id @param {string} squareId @param {{ taskId?: string } & Acting} input */
  linkTask(id, squareId, input) {
    const found = this.active(id);
    if (!found.success) return found;
    const taskId = M.text(input?.taskId) || null;
    const squares = found.data.squares.map((s) => (s.id === squareId ? { ...s, taskId } : s));
    if (!found.data.squares.some((s) => s.id === squareId))
      return this.missingItem('square', squareId);
    return this.commit(found.data, { squares }, input, 'task-link', `${squareId} -> ${taskId}`);
  }

  /**
   * Records a square result. A builder cannot pass their own work; results need evidence.
   * @param {string} id
   * @param {string} squareId
   * @param {{ status?: string, evidence?: string, command?: string, expected?: string } & Acting} input
   */
  updateSquare(id, squareId, input) {
    const found = this.get(id);
    if (!found.success) return found;
    const feature = found.data;
    const square = feature.squares.find((s) => s.id === squareId);
    if (!square) return this.missingItem('square', squareId);
    if (!M.SQUARE_RESULT_STATES.includes(/** @type {any} */ (feature.state))) {
      return wrongState(
        `Squares take results while building or verifying, not in ${feature.state}`,
      );
    }
    const status = M.text(input?.status);
    if (!M.SQUARE_STATUSES.includes(status)) return invalid(`Unknown square status "${status}"`);
    const actor = actorOf(input);
    const evidence = M.text(input.evidence);
    if (status === 'passed' && M.isBuilder(feature.builders, actor)) {
      return err(
        ErrorCodes.SHIPPING_SEPARATION_VIOLATION_005,
        `${actor} builds this feature and cannot pass its square`,
      );
    }
    if ((status === 'passed' || status === 'failed') && !evidence) {
      return err(ErrorCodes.SHIPPING_EVIDENCE_REQUIRED_006, `A ${status} square needs evidence`);
    }
    const at = this.iso();
    const settled = status === 'passed' || status === 'failed';
    const next = {
      ...square,
      status: /** @type {any} */ (status),
      evidence: settled ? evidence : square.evidence,
      by: settled ? actor : square.by,
      at: settled ? at : square.at,
    };
    /** @type {Partial<Feature>} */
    const changes = { squares: feature.squares.map((s) => (s.id === squareId ? next : s)) };
    if (status !== 'passed' && feature.state === M.SHIP_STATE.READY) {
      changes.state = M.SHIP_STATE.VERIFYING;
    }
    const res = this.commit(feature, changes, input, 'square-result', `${square.title}: ${status}`);
    if (status === 'failed') {
      this.raiseFriction(
        feature.id,
        `Square failed: ${square.title}`,
        'high',
        `square:${squareId}`,
      );
      this.recordFailingRegression({
        featureId: feature.id,
        title: square.title,
        command: M.text(input.command),
        expected: M.text(input.expected) || square.title,
        status: 'failing',
        evidence,
      });
      return this.get(feature.id);
    }
    return res;
  }

  /**
   * Moves a feature one step along the main path when its gate is open.
   * @param {string} id
   * @param {{ to?: string } & Acting} [input]
   */
  advance(id, input = {}) {
    const found = this.get(id);
    if (!found.success) return found;
    const feature = found.data;
    const to = M.nextState(feature.state);
    if (!to) return wrongState(`A ${feature.state} feature does not advance`);
    if (input.to && input.to !== to) return wrongState(`The next state is ${to}, not ${input.to}`);
    const missing = this.missingFor(feature, to);
    if (missing.length > 0) {
      return err(
        ErrorCodes.SHIPPING_GATE_BLOCKED_002,
        `Cannot move to ${to}: ${missing.join('; ')}`,
        {
          to,
          missing,
        },
      );
    }
    return this.commit(feature, { state: to }, input, 'state', `${feature.state} -> ${to}`);
  }

  /** @param {Feature} feature @param {ShipState} to */
  missingFor(feature, to) {
    const failingRegressionIds = this.regressions
      .filter((r) => r.featureId === feature.id && r.status === 'failing')
      .map((r) => r.id);
    return M.gateMissing(feature, to, { failingRegressionIds });
  }

  /** @param {string} id @param {Acting} [input] */
  pause(id, input) {
    const found = this.active(id);
    if (!found.success) return found;
    if (found.data.state === M.SHIP_STATE.PAUSED) return wrongState('Already paused');
    const from = found.data.state;
    return this.commit(
      found.data,
      { state: 'paused', pausedFrom: from },
      input,
      'state',
      `${from} -> paused`,
    );
  }

  /** @param {string} id @param {Acting} [input] */
  resume(id, input) {
    const found = this.get(id);
    if (!found.success) return found;
    const { state, pausedFrom } = found.data;
    if (state !== M.SHIP_STATE.PAUSED || !pausedFrom)
      return wrongState(`A ${state} feature cannot resume`);
    return this.commit(
      found.data,
      { state: pausedFrom, pausedFrom: null },
      input,
      'state',
      `paused -> ${pausedFrom}`,
    );
  }

  /** @param {string} id @param {Acting} [input] */
  archive(id, input) {
    const found = this.get(id);
    if (!found.success) return found;
    if (found.data.state === M.SHIP_STATE.ARCHIVED) return wrongState('Already archived');
    return this.commit(
      found.data,
      { state: 'archived' },
      input,
      'state',
      `${found.data.state} -> archived`,
    );
  }

  // ----------------------------------------------------------------- release

  /**
   * @param {string} id
   * @param {{ notes?: string, rollbackPlan?: string, baseline?: string, approvedBy?: string } & Acting} input
   */
  planRelease(id, input) {
    const found = this.get(id);
    if (!found.success) return found;
    const feature = found.data;
    if (feature.state !== M.SHIP_STATE.READY)
      return wrongState('Plan a release once the feature is ready');
    const approvedBy = M.text(input?.approvedBy) || null;
    if (approvedBy && !M.sameActor(approvedBy, actorOf(input))) {
      return err(
        ErrorCodes.SHIPPING_SEPARATION_VIOLATION_005,
        `Only ${approvedBy} can record their own approval`,
      );
    }
    if (approvedBy && M.isBuilder(feature.builders, approvedBy)) {
      return err(
        ErrorCodes.SHIPPING_SEPARATION_VIOLATION_005,
        `${approvedBy} builds this feature and cannot approve its release`,
      );
    }
    const release = {
      notes: M.text(input.notes),
      rollbackPlan: M.text(input.rollbackPlan),
      baseline: M.text(input.baseline),
      approvedBy,
      approvedAt: approvedBy ? this.iso() : null,
      smoke: null,
    };
    return this.commit(
      feature,
      { release },
      input,
      'release-plan',
      approvedBy ? `approved by ${approvedBy}` : 'draft',
    );
  }

  /** @param {string} id @param {{ status?: string, evidence?: string } & Acting} input */
  recordSmoke(id, input) {
    const found = this.get(id);
    if (!found.success) return found;
    const feature = found.data;
    if (feature.state !== M.SHIP_STATE.RELEASING || !feature.release) {
      return wrongState('Smoke checks are recorded while releasing');
    }
    const checked = this.result(input);
    if (!checked.success) return checked;
    const { status, evidence, actor, at } = checked.data;
    if (status === 'failed') {
      this.raiseFriction(
        feature.id,
        `Smoke check failed: ${feature.title}`,
        'high',
        `smoke:${feature.id}`,
      );
      return this.backToBuilding(feature, input, `smoke failed: ${evidence}`);
    }
    const release = { ...feature.release, smoke: { status, evidence, by: actor, at } };
    const readback = {
      dueAt: new Date(this.now() + M.READBACK_DELAY_MS).toISOString(),
      status: /** @type {const} */ ('pending'),
      evidence: null,
      by: null,
      at: null,
    };
    return this.commit(feature, { release, readback, state: 'watching' }, input, 'smoke', evidence);
  }

  /** @param {string} id @param {{ status?: string, evidence?: string } & Acting} input */
  recordReadback(id, input) {
    const found = this.get(id);
    if (!found.success) return found;
    const feature = found.data;
    if (feature.state !== M.SHIP_STATE.WATCHING || !feature.readback) {
      return wrongState('Readbacks are recorded while watching');
    }
    const checked = this.result(input);
    if (!checked.success) return checked;
    const { status, evidence, actor, at } = checked.data;
    if (status === 'failed') {
      this.raiseFriction(
        feature.id,
        `Readback failed: ${feature.title}`,
        'critical',
        `readback:${feature.id}`,
      );
      return this.backToBuilding(feature, input, `readback failed: ${evidence}`);
    }
    if (Date.parse(feature.readback.dueAt) > this.now()) {
      const missing = [`readback is not due until ${feature.readback.dueAt}`];
      return err(ErrorCodes.SHIPPING_GATE_BLOCKED_002, missing[0], { to: 'learned', missing });
    }
    const readback = {
      ...feature.readback,
      status: /** @type {const} */ ('passed'),
      evidence,
      by: actor,
      at,
    };
    const res = this.commit(feature, { readback }, input, 'readback', evidence);
    if (!res.success) return res;
    const learned = this.advance(id, input);
    return learned.success ? learned : this.get(id);
  }

  /** @param {{ status?: string, evidence?: string } & Acting} input */
  result(input) {
    const status = M.text(input?.status);
    if (status !== 'passed' && status !== 'failed')
      return invalid('status must be passed or failed');
    const evidence = M.text(input.evidence);
    if (!evidence)
      return err(ErrorCodes.SHIPPING_EVIDENCE_REQUIRED_006, `A ${status} check needs evidence`);
    return ok({
      status: /** @type {'passed'|'failed'} */ (status),
      evidence,
      actor: actorOf(input),
      at: this.iso(),
    });
  }

  /** @param {Feature} feature @param {Acting | undefined} input @param {string} detail */
  backToBuilding(feature, input, detail) {
    const squares = feature.squares.map(reopened);
    const changes = {
      state: /** @type {ShipState} */ ('building'),
      squares,
      release: null,
      readback: null,
    };
    return this.commit(
      feature,
      changes,
      input,
      'state',
      `${feature.state} -> building (${detail})`,
    );
  }

  /**
   * Marks readbacks past their due time overdue, raising one medium friction item each.
   * @returns {string[]} ids of the features marked now
   */
  markOverdue() {
    this.refresh();
    const now = this.now();
    /** @type {string[]} */
    const marked = [];
    for (const feature of this.features.values()) {
      const rb = feature.readback;
      if (feature.state !== M.SHIP_STATE.WATCHING || rb?.status !== 'pending') continue;
      if (Date.parse(rb.dueAt) > now) continue;
      const readback = { ...rb, status: /** @type {const} */ ('overdue') };
      this.commit(feature, { readback }, { actor: 'system' }, 'readback-overdue', rb.dueAt);
      this.raiseFriction(
        feature.id,
        `Readback overdue: ${feature.title}`,
        'medium',
        `overdue:${feature.id}`,
      );
      marked.push(feature.id);
    }
    return marked;
  }

  // ------------------------------------------------- friction and regressions

  /** @param {{ featureId?: string | null, title?: string, severity?: string } & Acting} input */
  addFriction(input) {
    this.refresh();
    return this.signals.addFriction(input);
  }

  /** @param {string} frictionId */
  resolveFriction(frictionId) {
    this.refresh();
    return this.signals.resolveFriction(frictionId);
  }

  /**
   * @param {string | null} featureId
   * @param {string} title
   * @param {import('./shipping-model').Severity} severity
   * @param {string} source
   */
  raiseFriction(featureId, title, severity, source) {
    return this.signals.raiseFriction(featureId, title, severity, source);
  }

  /** @param {string} featureId @param {{ title?: string, command?: string, expected?: string } & Acting} input */
  addRegression(featureId, input) {
    this.refresh();
    return this.signals.addRegression(featureId, input);
  }

  /** @param {Omit<Regression, 'id' | 'updatedAt'>} fields */
  recordFailingRegression(fields) {
    return this.signals.recordFailingRegression(fields);
  }

  /** @param {string} regressionId @param {{ status?: string, evidence?: string } & Acting} input */
  updateRegression(regressionId, input) {
    this.refresh();
    return this.signals.updateRegression(regressionId, input);
  }

  // --------------------------------------------------------- review gate link

  /**
   * Settles the squares linked to a task when the review gate approves or rejects it.
   * Wire it to TaskDispatcher onTaskEvent.
   * @param {string} type
   * @param {{ id?: string, reviewGate?: { reviewer?: string | null, proposal?: string, feedback?: string | null } | null }} task
   */
  onTaskEvent(type, task) {
    if ((type !== 'task:approved' && type !== 'task:rejected') || !task?.id) return;
    try {
      this.settleLinkedSquares(type, task);
    } catch (e) {
      console.warn('[ShippingLedger] Review-gate link failed:', e instanceof Error ? e.message : e);
    }
  }

  /**
   * @param {string} type
   * @param {{ id?: string, reviewGate?: { reviewer?: string | null, proposal?: string, feedback?: string | null } | null }} task
   */
  settleLinkedSquares(type, task) {
    this.refresh();
    const gate = task.reviewGate || {};
    const reviewer = M.text(gate.reviewer) || 'operator';
    // Collect first: each update may reload the ledger from disk.
    const linked = [...this.features.values()].flatMap((f) =>
      f.squares.filter((s) => s.taskId === task.id).map((s) => ({ feature: f, square: s })),
    );
    for (const { feature, square } of linked) {
      const res =
        type === 'task:approved'
          ? this.updateSquare(feature.id, square.id, {
              status: 'passed',
              actor: reviewer,
              evidence: `Task ${task.id} approved by ${reviewer}: ${M.text(gate.proposal) || 'no proposal'}${gate.feedback ? ` - ${gate.feedback}` : ''}`,
            })
          : this.updateSquare(feature.id, square.id, {
              status: 'failed',
              actor: reviewer,
              evidence: `Task ${task.id} rejected by ${reviewer}: ${M.text(gate.feedback) || 'no feedback'}`,
            });
      if (!res.success) {
        const current = this.features.get(feature.id);
        if (current)
          this.commit(
            current,
            {},
            { actor: 'system' },
            'task-link-refused',
            `${square.id}: ${res.message}`,
          );
      }
    }
  }

  // ---------------------------------------------------------------- reading

  /** @param {string} id @returns {import('../result').UnitResult<Feature & { nextGate: { to: string, missing: string[] } | null }>} */
  get(id) {
    this.refresh();
    const feature = this.features.get(id);
    if (!feature) return this.missingFeature(id);
    const to = M.nextState(feature.state);
    return ok({ ...feature, nextGate: to ? { to, missing: this.missingFor(feature, to) } : null });
  }

  /** @param {string} id A feature that still accepts edits. */
  active(id) {
    const found = this.get(id);
    if (found.success && TERMINAL.includes(/** @type {any} */ (found.data.state))) {
      return wrongState(`A ${found.data.state} feature is closed`);
    }
    return found;
  }

  /** @param {Feature} feature */
  activeRisk(feature) {
    const open = this.friction.filter((f) => f.featureId === feature.id && f.status === 'open');
    return [feature.risk, ...open.map((f) => f.severity)].reduce((a, b) =>
      M.severityRank(b) > M.severityRank(a) ? b : a,
    );
  }

  /** The portfolio, ordered by active risk, then how far along, then the latest update. */
  board() {
    this.refresh();
    const rank = (/** @type {string} */ state) =>
      TERMINAL.includes(/** @type {any} */ (state))
        ? -1
        : M.SHIP_FLOW.indexOf(/** @type {any} */ (state));
    const features = [...this.features.values()]
      .map((f) => ({ ...f, activeRisk: this.activeRisk(f) }))
      .sort(
        (a, b) =>
          M.severityRank(b.activeRisk) - M.severityRank(a.activeRisk) ||
          rank(b.state) - rank(a.state) ||
          Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      );
    return { features, friction: [...this.friction], regressions: [...this.regressions] };
  }

  /**
   * Dated shipping entries for the schedule calendar: readback due dates and targets.
   * @param {string} from
   * @param {string} to
   */
  calendarEntries(from, to) {
    this.refresh();
    return M.calendarEntriesOf(this.features.values(), from, to);
  }

  // ---------------------------------------------------------------- plumbing

  /**
   * Stores a new version of the feature with one more event.
   * @param {Feature} feature
   * @param {Partial<Feature>} changes
   * @param {Acting | undefined} input
   * @param {string} type
   * @param {string} detail
   */
  commit(feature, changes, input, type, detail) {
    const at = this.iso();
    const { nextGate: _gate, activeRisk: _risk, ...base } = /** @type {any} */ (feature);
    const event = { at, actor: actorOf(input), type, detail };
    const events = [...base.events, event].slice(-MAX_EVENTS_PER_FEATURE);
    return this.save({ ...base, ...changes, events, updatedAt: at });
  }

  /** @param {Feature} feature */
  save(feature) {
    this.features.set(feature.id, feature);
    const written = this.persist();
    if (!written.success) return written;
    this.emit('shipping:updated', { featureId: feature.id, state: feature.state });
    return this.get(feature.id);
  }

  /** @param {string} id */
  missingFeature(id) {
    return M.missing('feature', id);
  }

  /** @param {string} what @param {string} id */
  missingItem(what, id) {
    return M.missing(what, id);
  }

  /** @param {string} type @param {unknown} data */
  emit(type, data) {
    try {
      this.onEvent?.(type, data);
    } catch {}
  }

  /** @returns {import('../result').UnitResult<boolean>} */
  persist() {
    return this.store.write({
      features: [...this.features.values()],
      friction: this.signals.friction,
      regressions: this.signals.regressions,
    });
  }

  loadFromDisk() {
    const read = this.store.read();
    if (!read.success) return read;
    if (!read.data) return ok({ loaded: false, count: 0 });
    this.features = new Map(read.data.features.map((f) => [f.id, f]));
    this.signals.friction = read.data.friction;
    this.signals.regressions = read.data.regressions;
    return ok({ loaded: true, count: this.features.size });
  }

  /** Checks for overdue readbacks once a minute. */
  start(intervalMs = OVERDUE_CHECK_MS) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.markOverdue();
      } catch (e) {
        console.warn('[ShippingLedger] Overdue check failed:', e instanceof Error ? e.message : e);
      }
    }, intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { ShippingLedger, DEFAULT_SHIPPING_PATH };
