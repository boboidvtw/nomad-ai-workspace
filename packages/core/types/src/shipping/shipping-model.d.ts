export type ShipState = "draft" | "contract" | "building" | "verifying" | "ready" | "releasing" | "watching" | "learned" | "paused" | "archived";
export type Severity = "low" | "medium" | "high" | "critical";
export type Invariant = {
    id: string;
    text: string;
    required: boolean;
};
export type EvidenceSquare = {
    id: string;
    title: string;
    kind: string;
    /**
     * - invariant ids
     */
    covers: string[];
    owner: string | null;
    required: boolean;
    status: "open" | "running" | "passed" | "failed";
    evidence: string | null;
    by: string | null;
    at: string | null;
    /**
     * - a task whose review-gate decision settles this square
     */
    taskId: string | null;
};
export type SmokeCheck = {
    status: "passed" | "failed";
    evidence: string;
    by: string;
    at: string;
};
export type ReleasePlan = {
    notes: string;
    rollbackPlan: string;
    baseline: string;
    approvedBy: string | null;
    approvedAt: string | null;
    smoke: SmokeCheck | null;
};
export type Readback = {
    dueAt: string;
    status: "pending" | "overdue" | "passed";
    evidence: string | null;
    by: string | null;
    at: string | null;
};
export type ShipEvent = {
    at: string;
    actor: string;
    type: string;
    detail: string;
};
export type Feature = {
    id: string;
    title: string;
    problem: string;
    outcome: string;
    contract: string;
    priority: string;
    risk: Severity;
    target: string | null;
    builders: string[];
    state: ShipState;
    pausedFrom: ShipState | null;
    invariants: Invariant[];
    squares: EvidenceSquare[];
    release: ReleasePlan | null;
    readback: Readback | null;
    events: ShipEvent[];
    createdAt: string;
    updatedAt: string;
};
export type Friction = {
    id: string;
    featureId: string | null;
    title: string;
    severity: Severity;
    status: "open" | "resolved";
    source: string;
    createdAt: string;
    resolvedAt: string | null;
};
export type Regression = {
    id: string;
    featureId: string;
    title: string;
    command: string;
    expected: string;
    status: "open" | "passing" | "failing";
    evidence: string | null;
    updatedAt: string;
};
/** States a feature never leaves. */
export const TERMINAL_STATES: readonly ("learned" | "archived")[];
/**
 * Validates and normalizes the editable contract fields that are present in the input.
 * @param {Record<string, unknown>} input
 * @returns {import('../result').UnitResult<Partial<Feature>>}
 */
export function contractFields(input: Record<string, unknown>): import("../result").UnitResult<Partial<Feature>>;
/**
 * Dated shipping entries for the schedule calendar: readback due dates and targets.
 * The title is the feature's own; the calendar labels the kind.
 * @param {Iterable<Feature>} features
 * @param {string} from
 * @param {string} to
 */
export function calendarEntriesOf(features: Iterable<Feature>, from: string, to: string): ({
    kind: string;
    at: string;
    title: string;
    featureId: string;
    status: "pending" | "passed" | "overdue";
} | {
    kind: string;
    at: string;
    title: string;
    featureId: string;
    status: ShipState;
})[];
export const SHIP_STATE: Readonly<{
    DRAFT: "draft";
    CONTRACT: "contract";
    BUILDING: "building";
    VERIFYING: "verifying";
    READY: "ready";
    RELEASING: "releasing";
    WATCHING: "watching";
    LEARNED: "learned";
    PAUSED: "paused";
    ARCHIVED: "archived";
}>;
/** The main path, in order. */
export const SHIP_FLOW: readonly ("draft" | "contract" | "building" | "verifying" | "ready" | "releasing" | "watching" | "learned")[];
/** States in which squares take results (Cumora: verification happens while building). */
export const SQUARE_RESULT_STATES: readonly ("building" | "verifying" | "ready")[];
export const SQUARE_KINDS: readonly string[];
export const SQUARE_STATUSES: readonly string[];
/** Ready needs passed proof of each kind: the user path works, it is traceable, users are told. */
export const REQUIRED_PROOF_KINDS: readonly string[];
export const SEVERITIES: readonly string[];
export const PRIORITIES: readonly string[];
export const READBACK_DELAY_MS: number;
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
export function newId(prefix: string): string;
/** @param {{ actor?: string } | undefined} input The caller-stated actor; "operator" by default. */
export function actorOf(input: {
    actor?: string;
} | undefined): string;
/** @param {string} message @param {unknown} [details] */
export function invalid(message: string, details?: unknown): import("../result").UnitFailure<"SHIPPING_FEATURE_INVALID_001">;
/** @param {string} what @param {string} id */
export function missing(what: string, id: string): import("../result").UnitFailure<"SHIPPING_FEATURE_NOT_FOUND_003"> | import("../result").UnitFailure<"SHIPPING_ITEM_NOT_FOUND_004">;
/** @param {unknown} value */
export function text(value: unknown): string;
/** @param {unknown} value @returns {string[]} */
export function textList(value: unknown): string[];
/**
 * Whether two actor names are the same person or bot (case and a leading @ ignored), so
 * "@Claude" cannot slip past a builder listed as "claude".
 * @param {unknown} a
 * @param {unknown} b
 */
export function sameActor(a: unknown, b: unknown): boolean;
/** @param {string[]} builders @param {unknown} actor */
export function isBuilder(builders: string[], actor: unknown): boolean;
/** @param {Severity | string} severity */
export function severityRank(severity: Severity | string): number;
/** @param {ShipState} state @returns {ShipState | null} */
export function nextState(state: ShipState): ShipState | null;
/**
 * What still stands between a feature and its next state. Empty means the gate is open.
 * @param {Feature} feature
 * @param {ShipState} to
 * @param {{ failingRegressionIds: string[] }} context
 * @returns {string[]}
 */
export function gateMissing(feature: Feature, to: ShipState, context: {
    failingRegressionIds: string[];
}): string[];
