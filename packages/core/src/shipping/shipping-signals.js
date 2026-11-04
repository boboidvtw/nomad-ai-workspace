/**
 * Nomad Shared Core - Shipping signals: the friction inbox and regression assets
 * Failed verification feeds both (Cumora SHIPPING.md); the ledger owns when, this owns how.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const M = require('./shipping-model');

/** Friction and regression lists keep at most this many items (open ones first). */
const MAX_ITEMS = 500;

/** @typedef {import('./shipping-model').Friction} Friction */
/** @typedef {import('./shipping-model').Regression} Regression */
/** @typedef {{ actor?: string }} Acting */

/**
 * @typedef {Object} SignalDeps
 * @property {() => number} now
 * @property {(featureId: string) => boolean} hasFeature
 * @property {() => unknown} persist
 * @property {(type: string, data: unknown) => void} emit
 */

class ShippingSignals {
  /** @param {SignalDeps} deps */
  constructor(deps) {
    this.deps = deps;
    /** @type {Friction[]} */
    this.friction = [];
    /** @type {Regression[]} */
    this.regressions = [];
  }

  iso() {
    return new Date(this.deps.now()).toISOString();
  }

  /** @param {{ featureId?: string | null, title?: string, severity?: string } & Acting} input */
  addFriction(input) {
    const title = M.text(input?.title);
    const severity = M.text(input?.severity) || 'medium';
    if (!title) return M.invalid('Friction needs a title');
    if (!M.SEVERITIES.includes(/** @type {any} */ (severity))) return M.invalid('Unknown severity');
    const featureId = M.text(input.featureId) || null;
    if (featureId && !this.deps.hasFeature(featureId)) return M.missing('feature', featureId);
    return ok(
      this.raiseFriction(
        featureId,
        title,
        /** @type {any} */ (severity),
        `manual:${M.actorOf(input)}`,
      ),
    );
  }

  /** @param {string} frictionId */
  resolveFriction(frictionId) {
    const item = this.friction.find((f) => f.id === frictionId);
    if (!item) return M.missing('friction', frictionId);
    const resolved = { ...item, status: /** @type {const} */ ('resolved'), resolvedAt: this.iso() };
    this.friction = this.friction.map((f) => (f.id === frictionId ? resolved : f));
    this.deps.persist();
    this.deps.emit('shipping:friction', resolved);
    return ok(resolved);
  }

  /**
   * @param {string | null} featureId
   * @param {string} title
   * @param {import('./shipping-model').Severity} severity
   * @param {string} source
   * @returns {Friction}
   */
  raiseFriction(featureId, title, severity, source) {
    const open = this.friction.find(
      (f) => f.status === 'open' && f.source === source && f.featureId === featureId,
    );
    if (open) return open;
    /** @type {Friction} */
    const item = {
      id: M.newId('fr'),
      featureId,
      title,
      severity,
      status: 'open',
      source,
      createdAt: this.iso(),
      resolvedAt: null,
    };
    this.friction = capped([item, ...this.friction], (f) => f.status === 'open');
    this.deps.persist();
    this.deps.emit('shipping:friction', item);
    return item;
  }

  /** @param {string} featureId @param {{ title?: string, command?: string, expected?: string } & Acting} input */
  addRegression(featureId, input) {
    if (!this.deps.hasFeature(featureId)) return M.missing('feature', featureId);
    const title = M.text(input?.title);
    if (!title) return M.invalid('A regression needs a title');
    return ok(
      this.pushRegression({
        featureId,
        title,
        command: M.text(input.command),
        expected: M.text(input.expected),
        status: 'open',
        evidence: null,
      }),
    );
  }

  /** @param {Omit<Regression, 'id' | 'updatedAt'>} fields */
  pushRegression(fields) {
    const item = { ...fields, id: M.newId('reg'), updatedAt: this.iso() };
    this.regressions = capped([item, ...this.regressions], (r) => r.status !== 'passing');
    this.deps.persist();
    this.deps.emit('shipping:regression', item);
    return item;
  }

  /**
   * A square that fails again updates its existing regression instead of adding another.
   * @param {Omit<Regression, 'id' | 'updatedAt'>} fields
   */
  recordFailingRegression(fields) {
    const existing = this.regressions.find(
      (r) => r.featureId === fields.featureId && r.title === fields.title,
    );
    if (!existing) return this.pushRegression(fields);
    const next = {
      ...existing,
      status: /** @type {const} */ ('failing'),
      evidence: fields.evidence,
      command: fields.command || existing.command,
      updatedAt: this.iso(),
    };
    this.regressions = this.regressions.map((r) => (r.id === existing.id ? next : r));
    this.deps.persist();
    this.deps.emit('shipping:regression', next);
    return next;
  }

  /** @param {string} regressionId @param {{ status?: string, evidence?: string } & Acting} input */
  updateRegression(regressionId, input) {
    const item = this.regressions.find((r) => r.id === regressionId);
    if (!item) return M.missing('regression', regressionId);
    const status = M.text(input?.status);
    if (status !== 'passing' && status !== 'failing')
      return M.invalid('status must be passing or failing');
    const evidence = M.text(input.evidence);
    if (!evidence)
      return err(ErrorCodes.SHIPPING_EVIDENCE_REQUIRED_006, 'A regression result needs evidence');
    const next = {
      ...item,
      status: /** @type {'passing' | 'failing'} */ (status),
      evidence,
      updatedAt: this.iso(),
    };
    this.regressions = this.regressions.map((r) => (r.id === regressionId ? next : r));
    this.deps.persist();
    this.deps.emit('shipping:regression', next);
    return ok(next);
  }
}

/**
 * Trims a newest-first list to MAX_ITEMS, dropping the oldest closed items before open ones.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => boolean} isOpen
 * @returns {T[]}
 */
function capped(items, isOpen) {
  if (items.length <= MAX_ITEMS) return items;
  const open = items.filter(isOpen);
  const keepClosed = new Set(
    items.filter((i) => !isOpen(i)).slice(0, Math.max(0, MAX_ITEMS - open.length)),
  );
  return items.filter((i) => isOpen(i) || keepClosed.has(i)).slice(0, MAX_ITEMS);
}

module.exports = { ShippingSignals, MAX_ITEMS };
