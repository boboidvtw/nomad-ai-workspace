export type Friction = import("./shipping-model").Friction;
export type Regression = import("./shipping-model").Regression;
export type Acting = {
    actor?: string;
};
export type SignalDeps = {
    now: () => number;
    hasFeature: (featureId: string) => boolean;
    persist: () => unknown;
    emit: (type: string, data: unknown) => void;
};
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
export class ShippingSignals {
    /** @param {SignalDeps} deps */
    constructor(deps: SignalDeps);
    deps: SignalDeps;
    /** @type {Friction[]} */
    friction: Friction[];
    /** @type {Regression[]} */
    regressions: Regression[];
    iso(): string;
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
     * @returns {Friction}
     */
    raiseFriction(featureId: string | null, title: string, severity: import("./shipping-model").Severity, source: string): Friction;
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
        featureId: string;
        command: string;
        expected: string;
        evidence: string | null;
    }>;
    /** @param {Omit<Regression, 'id' | 'updatedAt'>} fields */
    pushRegression(fields: Omit<Regression, "id" | "updatedAt">): {
        id: string;
        updatedAt: string;
        status: "open" | "passing" | "failing";
        title: string;
        featureId: string;
        command: string;
        expected: string;
        evidence: string | null;
    };
    /**
     * A square that fails again updates its existing regression instead of adding another.
     * @param {Omit<Regression, 'id' | 'updatedAt'>} fields
     */
    recordFailingRegression(fields: Omit<Regression, "id" | "updatedAt">): {
        id: string;
        updatedAt: string;
        status: "open" | "passing" | "failing";
        title: string;
        featureId: string;
        command: string;
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
}
/** Friction and regression lists keep at most this many items (open ones first). */
export const MAX_ITEMS: 500;
import M = require("./shipping-model");
