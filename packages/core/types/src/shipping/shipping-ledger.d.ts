export type Feature = import("./shipping-model").Feature;
export type Friction = import("./shipping-model").Friction;
export type Regression = import("./shipping-model").Regression;
export type ShipState = import("./shipping-model").ShipState;
export type Acting = {
    actor?: string;
};
export class ShippingLedger {
    /**
     * @param {Object} [options]
     * @param {string | null} [options.storagePath] - null keeps the ledger in memory
     * @param {() => number} [options.now]
     * @param {(type: string, data: unknown) => void} [options.onEvent]
     */
    constructor(options?: {
        storagePath?: string | null | undefined;
        now?: (() => number) | undefined;
        onEvent?: ((type: string, data: unknown) => void) | undefined;
    });
    storagePath: string | null;
    now: () => number;
    onEvent: ((type: string, data: unknown) => void) | null;
    /** @type {Map<string, Feature>} */
    features: Map<string, Feature>;
    store: ShippingStore;
    signals: ShippingSignals;
    /** @type {NodeJS.Timeout | null} */
    timer: NodeJS.Timeout | null;
    get friction(): M.Friction[];
    get regressions(): M.Regression[];
    /** The daemon and the Studio each hold a ledger on the same file: reload when the other wrote. */
    refresh(): void;
    iso(): string;
    /**
     * @param {{ title?: string, problem?: string, outcome?: string, contract?: string, builders?: string[], priority?: string, risk?: string, target?: string | null } & Acting} input
     */
    create(input: {
        title?: string;
        problem?: string;
        outcome?: string;
        contract?: string;
        builders?: string[];
        priority?: string;
        risk?: string;
        target?: string | null;
    } & Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /** @param {string} id @param {Record<string, unknown> & Acting} input */
    updateContract(id: string, input: Record<string, unknown> & Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /** @param {string} id @param {{ text?: string, required?: boolean } & Acting} input */
    addInvariant(id: string, input: {
        text?: string;
        required?: boolean;
    } & Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /**
     * @param {string} id
     * @param {{ title?: string, kind?: string, covers?: string[], owner?: string | null, required?: boolean, taskId?: string | null } & Acting} input
     */
    addSquare(id: string, input: {
        title?: string;
        kind?: string;
        covers?: string[];
        owner?: string | null;
        required?: boolean;
        taskId?: string | null;
    } & Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /** @param {string} id @param {string} squareId @param {{ taskId?: string } & Acting} input */
    linkTask(id: string, squareId: string, input: {
        taskId?: string;
    } & Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /**
     * Records a square result. A builder cannot pass their own work; results need evidence.
     * @param {string} id
     * @param {string} squareId
     * @param {{ status?: string, evidence?: string, command?: string, expected?: string } & Acting} input
     */
    updateSquare(id: string, squareId: string, input: {
        status?: string;
        evidence?: string;
        command?: string;
        expected?: string;
    } & Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /**
     * Moves a feature one step along the main path when its gate is open.
     * @param {string} id
     * @param {{ to?: string } & Acting} [input]
     */
    advance(id: string, input?: {
        to?: string;
    } & Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /** @param {Feature} feature @param {ShipState} to */
    missingFor(feature: Feature, to: ShipState): string[];
    /** @param {string} id @param {Acting} [input] */
    pause(id: string, input?: Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /** @param {string} id @param {Acting} [input] */
    resume(id: string, input?: Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /** @param {string} id @param {Acting} [input] */
    archive(id: string, input?: Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /**
     * @param {string} id
     * @param {{ notes?: string, rollbackPlan?: string, baseline?: string, approvedBy?: string } & Acting} input
     */
    planRelease(id: string, input: {
        notes?: string;
        rollbackPlan?: string;
        baseline?: string;
        approvedBy?: string;
    } & Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /** @param {string} id @param {{ status?: string, evidence?: string } & Acting} input */
    recordSmoke(id: string, input: {
        status?: string;
        evidence?: string;
    } & Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /** @param {string} id @param {{ status?: string, evidence?: string } & Acting} input */
    recordReadback(id: string, input: {
        status?: string;
        evidence?: string;
    } & Acting): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /** @param {{ status?: string, evidence?: string } & Acting} input */
    result(input: {
        status?: string;
        evidence?: string;
    } & Acting): import("../result").UnitFailure<"SHIPPING_FEATURE_INVALID_001"> | import("../result").UnitFailure<"SHIPPING_EVIDENCE_REQUIRED_006"> | import("../result").UnitSuccess<{
        status: "passed" | "failed";
        evidence: string;
        actor: string;
        at: string;
    }>;
    /** @param {Feature} feature @param {Acting | undefined} input @param {string} detail */
    backToBuilding(feature: Feature, input: Acting | undefined, detail: string): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /**
     * Marks readbacks past their due time overdue, raising one medium friction item each.
     * @returns {string[]} ids of the features marked now
     */
    markOverdue(): string[];
    /** @param {{ featureId?: string | null, title?: string, severity?: string } & Acting} input */
    addFriction(input: {
        featureId?: string | null;
        title?: string;
        severity?: string;
    } & Acting): import("../result").UnitFailure<"SHIPPING_FEATURE_INVALID_001"> | import("../result").UnitFailure<"SHIPPING_FEATURE_NOT_FOUND_003"> | import("../result").UnitFailure<"SHIPPING_ITEM_NOT_FOUND_004"> | import("../result").UnitSuccess<M.Friction>;
    /** @param {string} frictionId */
    resolveFriction(frictionId: string): import("../result").UnitFailure<"SHIPPING_FEATURE_NOT_FOUND_003"> | import("../result").UnitFailure<"SHIPPING_ITEM_NOT_FOUND_004"> | import("../result").UnitSuccess<{
        status: "resolved";
        resolvedAt: string;
        id: string;
        featureId: string | null;
        title: string;
        severity: M.Severity;
        source: string;
        createdAt: string;
    }>;
    /**
     * @param {string | null} featureId
     * @param {string} title
     * @param {import('./shipping-model').Severity} severity
     * @param {string} source
     */
    raiseFriction(featureId: string | null, title: string, severity: import("./shipping-model").Severity, source: string): M.Friction;
    /** @param {string} featureId @param {{ title?: string, command?: string, expected?: string } & Acting} input */
    addRegression(featureId: string, input: {
        title?: string;
        command?: string;
        expected?: string;
    } & Acting): import("../result").UnitFailure<"SHIPPING_FEATURE_INVALID_001"> | import("../result").UnitFailure<"SHIPPING_FEATURE_NOT_FOUND_003"> | import("../result").UnitFailure<"SHIPPING_ITEM_NOT_FOUND_004"> | import("../result").UnitSuccess<{
        id: string;
        updatedAt: string;
        status: "open" | "passing" | "failing";
        title: string;
        command: string;
        featureId: string;
        expected: string;
        evidence: string | null;
    }>;
    /** @param {Omit<Regression, 'id' | 'updatedAt'>} fields */
    recordFailingRegression(fields: Omit<Regression, "id" | "updatedAt">): {
        id: string;
        updatedAt: string;
        status: "open" | "passing" | "failing";
        title: string;
        command: string;
        featureId: string;
        expected: string;
        evidence: string | null;
    };
    /** @param {string} regressionId @param {{ status?: string, evidence?: string } & Acting} input */
    updateRegression(regressionId: string, input: {
        status?: string;
        evidence?: string;
    } & Acting): import("../result").UnitFailure<"SHIPPING_FEATURE_INVALID_001"> | import("../result").UnitFailure<"SHIPPING_FEATURE_NOT_FOUND_003"> | import("../result").UnitFailure<"SHIPPING_ITEM_NOT_FOUND_004"> | import("../result").UnitFailure<"SHIPPING_EVIDENCE_REQUIRED_006"> | import("../result").UnitSuccess<{
        status: "passing" | "failing";
        evidence: string;
        updatedAt: string;
        id: string;
        featureId: string;
        title: string;
        command: string;
        expected: string;
    }>;
    /**
     * Settles the squares linked to a task when the review gate approves or rejects it.
     * Wire it to TaskDispatcher onTaskEvent.
     * @param {string} type
     * @param {{ id?: string, reviewGate?: { reviewer?: string | null, proposal?: string, feedback?: string | null } | null }} task
     */
    onTaskEvent(type: string, task: {
        id?: string;
        reviewGate?: {
            reviewer?: string | null;
            proposal?: string;
            feedback?: string | null;
        } | null;
    }): void;
    /**
     * @param {string} type
     * @param {{ id?: string, reviewGate?: { reviewer?: string | null, proposal?: string, feedback?: string | null } | null }} task
     */
    settleLinkedSquares(type: string, task: {
        id?: string;
        reviewGate?: {
            reviewer?: string | null;
            proposal?: string;
            feedback?: string | null;
        } | null;
    }): void;
    /** @param {string} id @returns {import('../result').UnitResult<Feature & { nextGate: { to: string, missing: string[] } | null }>} */
    get(id: string): import("../result").UnitResult<Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }>;
    /** @param {string} id A feature that still accepts edits. */
    active(id: string): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /** @param {Feature} feature */
    activeRisk(feature: Feature): M.Severity;
    /** The portfolio, ordered by active risk, then how far along, then the latest update. */
    board(): {
        features: {
            activeRisk: M.Severity;
            id: string;
            title: string;
            problem: string;
            outcome: string;
            contract: string;
            priority: string;
            risk: M.Severity;
            target: string | null;
            builders: string[];
            state: M.ShipState;
            pausedFrom: M.ShipState | null;
            invariants: M.Invariant[];
            squares: M.EvidenceSquare[];
            release: M.ReleasePlan | null;
            readback: M.Readback | null;
            events: M.ShipEvent[];
            createdAt: string;
            updatedAt: string;
        }[];
        friction: M.Friction[];
        regressions: M.Regression[];
    };
    /**
     * Dated shipping entries for the schedule calendar: readback due dates and targets.
     * @param {string} from
     * @param {string} to
     */
    calendarEntries(from: string, to: string): ({
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
        status: M.ShipState;
    })[];
    /**
     * Stores a new version of the feature with one more event.
     * @param {Feature} feature
     * @param {Partial<Feature>} changes
     * @param {Acting | undefined} input
     * @param {string} type
     * @param {string} detail
     */
    commit(feature: Feature, changes: Partial<Feature>, input: Acting | undefined, type: string, detail: string): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /** @param {Feature} feature */
    save(feature: Feature): import("../result").UnitResult<M.Feature & {
        nextGate: {
            to: string;
            missing: string[];
        } | null;
    }, string>;
    /** @param {string} id */
    missingFeature(id: string): import("../result").UnitFailure<"SHIPPING_FEATURE_NOT_FOUND_003"> | import("../result").UnitFailure<"SHIPPING_ITEM_NOT_FOUND_004">;
    /** @param {string} what @param {string} id */
    missingItem(what: string, id: string): import("../result").UnitFailure<"SHIPPING_FEATURE_NOT_FOUND_003"> | import("../result").UnitFailure<"SHIPPING_ITEM_NOT_FOUND_004">;
    /** @param {string} type @param {unknown} data */
    emit(type: string, data: unknown): void;
    /** @returns {import('../result').UnitResult<boolean>} */
    persist(): import("../result").UnitResult<boolean>;
    loadFromDisk(): import("../result").UnitFailure<string> | import("../result").UnitSuccess<{
        loaded: boolean;
        count: number;
    }>;
    /** Checks for overdue readbacks once a minute. */
    start(intervalMs?: number): void;
    stop(): void;
}
export const DEFAULT_SHIPPING_PATH: string;
import { ShippingStore } from "./shipping-store";
import { ShippingSignals } from "./shipping-signals";
import M = require("./shipping-model");
