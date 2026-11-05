/**
 * Nomad Shared Core - Shipping lifecycle model
 * The evidence-to-delivery lifecycle borrowed from Cumora docs/SHIPPING.md (MIT, yetone/cumora):
 * Draft -> Contract -> Building -> Verifying -> Ready -> Releasing -> Watching -> Learned,
 * with Paused and Archived as side states. Gates here are pure functions; the ledger enforces them.
 * Also holds the small helpers the ledger and the signals share.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const crypto = require('node:crypto');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

const SHIP_STATE = Object.freeze({
  DRAFT: 'draft',
  CONTRACT: 'contract',
  BUILDING: 'building',
  VERIFYING: 'verifying',
  READY: 'ready',
  RELEASING: 'releasing',
  WATCHING: 'watching',
  LEARNED: 'learned',
  PAUSED: 'paused',
  ARCHIVED: 'archived',
});

/** The main path, in order. */
const SHIP_FLOW = Object.freeze([
  SHIP_STATE.DRAFT,
  SHIP_STATE.CONTRACT,
  SHIP_STATE.BUILDING,
  SHIP_STATE.VERIFYING,
  SHIP_STATE.READY,
  SHIP_STATE.RELEASING,
  SHIP_STATE.WATCHING,
  SHIP_STATE.LEARNED,
]);

/** States in which squares take results (Cumora: verification happens while building). */
const SQUARE_RESULT_STATES = Object.freeze([
  SHIP_STATE.BUILDING,
  SHIP_STATE.VERIFYING,
  SHIP_STATE.READY,
]);

const SQUARE_KINDS = Object.freeze(['test', 'user-path', 'trace', 'release-note', 'manual']);
const SQUARE_STATUSES = Object.freeze(['open', 'running', 'passed', 'failed']);
/** Ready needs passed proof of each kind: the user path works, it is traceable, users are told. */
const REQUIRED_PROOF_KINDS = Object.freeze(['user-path', 'trace', 'release-note']);
const SEVERITIES = Object.freeze(['low', 'medium', 'high', 'critical']);
const PRIORITIES = Object.freeze(['low', 'medium', 'high', 'urgent']);
const READBACK_DELAY_MS = 24 * 3600000;

/**
 * @typedef {'draft'|'contract'|'building'|'verifying'|'ready'|'releasing'|'watching'|'learned'|'paused'|'archived'} ShipState
 * @typedef {'low'|'medium'|'high'|'critical'} Severity
 *
 * @typedef {Object} Invariant
 * @property {string} id
 * @property {string} text
 * @property {boolean} required
 *
 * @typedef {Object} EvidenceSquare
 * @property {string} id
 * @property {string} title
 * @property {string} kind
 * @property {string[]} covers - invariant ids
 * @property {string | null} owner
 * @property {boolean} required
 * @property {'open'|'running'|'passed'|'failed'} status
 * @property {string | null} evidence
 * @property {string | null} by
 * @property {string | null} at
 * @property {string | null} taskId - a task whose review-gate decision settles this square
 *
 * @typedef {Object} SmokeCheck
 * @property {'passed'|'failed'} status
 * @property {string} evidence
 * @property {string} by
 * @property {string} at
 *
 * @typedef {Object} ReleasePlan
 * @property {string} notes
 * @property {string} rollbackPlan
 * @property {string} baseline
 * @property {string | null} approvedBy
 * @property {string | null} approvedAt
 * @property {SmokeCheck | null} smoke
 *
 * @typedef {Object} Readback
 * @property {string} dueAt
 * @property {'pending'|'overdue'|'passed'} status
 * @property {string | null} evidence
 * @property {string | null} by
 * @property {string | null} at
 *
 * @typedef {Object} ShipEvent
 * @property {string} at
 * @property {string} actor
 * @property {string} type
 * @property {string} detail
 *
 * @typedef {Object} Feature
 * @property {string} id
 * @property {string} title
 * @property {string} problem
 * @property {string} outcome
 * @property {string} contract
 * @property {string} priority
 * @property {Severity} risk
 * @property {string | null} target
 * @property {string[]} builders
 * @property {ShipState} state
 * @property {ShipState | null} pausedFrom
 * @property {Invariant[]} invariants
 * @property {EvidenceSquare[]} squares
 * @property {ReleasePlan | null} release
 * @property {Readback | null} readback
 * @property {ShipEvent[]} events
 * @property {string} createdAt
 * @property {string} updatedAt
 *
 * @typedef {Object} Friction
 * @property {string} id
 * @property {string | null} featureId
 * @property {string} title
 * @property {Severity} severity
 * @property {'open'|'resolved'} status
 * @property {string} source
 * @property {string} createdAt
 * @property {string | null} resolvedAt
 *
 * @typedef {Object} Regression
 * @property {string} id
 * @property {string} featureId
 * @property {string} title
 * @property {string} command
 * @property {string} expected
 * @property {'open'|'passing'|'failing'} status
 * @property {string | null} evidence
 * @property {string} updatedAt
 */

/** @param {string} prefix */
function newId(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** @param {{ actor?: string } | undefined} input The caller-stated actor; "operator" by default. */
function actorOf(input) {
  return text(input?.actor) || 'operator';
}

/** @param {string} message @param {unknown} [details] */
function invalid(message, details) {
  return err(ErrorCodes.SHIPPING_FEATURE_INVALID_001, message, details);
}

/** @param {string} what @param {string} id */
function missing(what, id) {
  return what === 'feature'
    ? err(ErrorCodes.SHIPPING_FEATURE_NOT_FOUND_003, `Feature "${id}" not found`)
    : err(ErrorCodes.SHIPPING_ITEM_NOT_FOUND_004, `${what} "${id}" not found`);
}

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} value @returns {string[]} */
function textList(value) {
  return Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];
}

/**
 * Whether two actor names are the same person or bot (case and a leading @ ignored), so
 * "@Claude" cannot slip past a builder listed as "claude".
 * @param {unknown} a
 * @param {unknown} b
 */
function sameActor(a, b) {
  const key = (/** @type {unknown} */ v) => text(v).replace(/^@/, '').toLowerCase();
  return key(a) !== '' && key(a) === key(b);
}

/** @param {string[]} builders @param {unknown} actor */
function isBuilder(builders, actor) {
  return builders.some((b) => sameActor(b, actor));
}

/** @param {Severity | string} severity */
function severityRank(severity) {
  return SEVERITIES.indexOf(/** @type {Severity} */ (severity)) + 1;
}

/** @param {ShipState} state @returns {ShipState | null} */
function nextState(state) {
  const index = /** @type {readonly string[]} */ (SHIP_FLOW).indexOf(state);
  return index >= 0 && index < SHIP_FLOW.length - 1 ? SHIP_FLOW[index + 1] : null;
}

/**
 * What still stands between a feature and its next state. Empty means the gate is open.
 * @param {Feature} feature
 * @param {ShipState} to
 * @param {{ failingRegressionIds: string[] }} context
 * @returns {string[]}
 */
function gateMissing(feature, to, context) {
  const target = SHIP_FLOW.indexOf(/** @type {any} */ (to));
  if (target < 1) return [`no gate leads to ${to}`];
  // Later gates re-check the earlier ones, so a change after a gate cannot slip through.
  return SHIP_FLOW.slice(1, target + 1).flatMap((step) => stepMissing(feature, step, context));
}

/**
 * The checks of one gate on its own.
 * @param {Feature} feature
 * @param {ShipState} to
 * @param {{ failingRegressionIds: string[] }} context
 * @returns {string[]}
 */
function stepMissing(feature, to, context) {
  /** @type {string[]} */
  const missing = [];
  const required = feature.squares.filter((s) => s.required);
  switch (to) {
    case SHIP_STATE.CONTRACT:
      if (!feature.problem) missing.push('problem');
      if (!feature.outcome) missing.push('outcome');
      if (!feature.contract) missing.push('contract');
      break;
    case SHIP_STATE.BUILDING:
      if (feature.builders.length === 0) missing.push('builder');
      if (feature.invariants.length === 0) missing.push('invariant');
      break;
    case SHIP_STATE.VERIFYING:
      for (const inv of feature.invariants.filter((i) => i.required)) {
        if (!feature.squares.some((s) => s.covers.includes(inv.id))) {
          missing.push(`invariant ${inv.id} is not covered by a square`);
        }
      }
      for (const square of required.filter((s) => !s.owner)) {
        missing.push(`square ${square.id} has no owner`);
      }
      break;
    case SHIP_STATE.READY:
      for (const square of required.filter((s) => s.status !== 'passed')) {
        missing.push(`square ${square.id} has not passed`);
      }
      for (const kind of REQUIRED_PROOF_KINDS) {
        if (!feature.squares.some((s) => s.kind === kind && s.status === 'passed')) {
          missing.push(`no passed ${kind} square`);
        }
      }
      break;
    case SHIP_STATE.RELEASING:
      if (!feature.release?.notes) missing.push('release notes');
      if (!feature.release?.rollbackPlan) missing.push('rollback plan');
      if (!feature.release?.baseline) missing.push('baseline');
      if (!feature.release?.approvedBy) missing.push('approval');
      break;
    case SHIP_STATE.WATCHING:
      if (feature.release?.smoke?.status !== 'passed') missing.push('passed smoke check');
      break;
    case SHIP_STATE.LEARNED:
      if (feature.readback?.status !== 'passed') missing.push('passed readback');
      for (const id of context.failingRegressionIds) missing.push(`regression ${id} is failing`);
      break;
    default:
      missing.push(`no gate leads to ${to}`);
  }
  return missing;
}

/** States a feature never leaves. */
const TERMINAL_STATES = Object.freeze([SHIP_STATE.LEARNED, SHIP_STATE.ARCHIVED]);

/** @param {unknown} value @returns {string | null | undefined} undefined when invalid */
function isoOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

/**
 * Validates and normalizes the editable contract fields that are present in the input.
 * @param {Record<string, unknown>} input
 * @returns {import('../result').UnitResult<Partial<Feature>>}
 */
function contractFields(input) {
  /** @type {Partial<Feature>} */
  const fields = {};
  for (const key of /** @type {const} */ (['title', 'problem', 'outcome', 'contract'])) {
    if (input[key] !== undefined) fields[key] = text(input[key]);
  }
  if (fields.title === '') return invalid('A feature needs a title');
  if (input.builders !== undefined) fields.builders = textList(input.builders);
  if (input.priority !== undefined) {
    if (!PRIORITIES.includes(String(input.priority))) return invalid('Unknown priority');
    fields.priority = String(input.priority);
  }
  if (input.risk !== undefined) {
    if (!SEVERITIES.includes(/** @type {any} */ (input.risk))) return invalid('Unknown risk');
    fields.risk = /** @type {Severity} */ (input.risk);
  }
  if (input.target !== undefined) {
    const target = isoOrNull(input.target);
    if (target === undefined) return invalid('target must be an ISO date');
    fields.target = target;
  }
  return ok(fields);
}

/**
 * Dated shipping entries for the schedule calendar: readback due dates and targets.
 * The title is the feature's own; the calendar labels the kind.
 * @param {Iterable<Feature>} features
 * @param {string} from
 * @param {string} to
 */
function calendarEntriesOf(features, from, to) {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  const inRange = (/** @type {string} */ at) => {
    const ms = Date.parse(at);
    return ms >= fromMs && ms < toMs;
  };
  const entries = [];
  for (const f of features) {
    if (f.state === SHIP_STATE.WATCHING && f.readback && inRange(f.readback.dueAt)) {
      entries.push({
        kind: 'readback',
        at: f.readback.dueAt,
        title: f.title,
        featureId: f.id,
        status: f.readback.status,
      });
    }
    if (
      f.target &&
      !(/** @type {readonly string[]} */ (TERMINAL_STATES).includes(f.state)) &&
      inRange(f.target)
    ) {
      entries.push({
        kind: 'target',
        at: f.target,
        title: f.title,
        featureId: f.id,
        status: f.state,
      });
    }
  }
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

module.exports = {
  TERMINAL_STATES,
  contractFields,
  calendarEntriesOf,
  SHIP_STATE,
  SHIP_FLOW,
  SQUARE_RESULT_STATES,
  SQUARE_KINDS,
  SQUARE_STATUSES,
  REQUIRED_PROOF_KINDS,
  SEVERITIES,
  PRIORITIES,
  READBACK_DELAY_MS,
  newId,
  actorOf,
  invalid,
  missing,
  text,
  textList,
  sameActor,
  isBuilder,
  severityRank,
  nextState,
  gateMissing,
};
