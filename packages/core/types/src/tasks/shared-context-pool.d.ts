export type SharedFinding = {
    id: string;
    agentId: string;
    taskId: string | null;
    domain: string;
    title: string;
    content: string;
    tags: string[];
    tokens: number;
    createdAt: string;
};
export type FailureImmunization = {
    id: string;
    agentId: string;
    taskId: string;
    domain: string;
    errorCode: string;
    symptom: string;
    rootCause: string;
    mitigation: string;
    tokens: number;
    createdAt: string;
};
/**
 * @typedef {Object} SharedFinding
 * @property {string} id
 * @property {string} agentId
 * @property {string | null} taskId
 * @property {string} domain
 * @property {string} title
 * @property {string} content
 * @property {string[]} tags
 * @property {number} tokens
 * @property {string} createdAt
 */
/**
 * @typedef {Object} FailureImmunization
 * @property {string} id
 * @property {string} agentId
 * @property {string} taskId
 * @property {string} domain
 * @property {string} errorCode
 * @property {string} symptom
 * @property {string} rootCause
 * @property {string} mitigation
 * @property {number} tokens
 * @property {string} createdAt
 */
export class SharedContextPool {
    /**
     * @param {Object} [options]
     * @param {import('../evolver/evolver-workbench').EvolverWorkbench | null} [options.evolverWorkbench]
     * @param {import('./p2p-bus').P2PBus | null} [options.p2pBus]
     * @param {string} [options.experienceLibraryRoot]
     * @param {number} [options.defaultTokenBudget=4000]
     * @param {Function} [options.onEvent] - (eventType: string, payload: any) => void
     */
    constructor(options?: {
        evolverWorkbench?: import("../evolver/evolver-workbench").EvolverWorkbench | null | undefined;
        p2pBus?: import("./p2p-bus").P2PBus | null | undefined;
        experienceLibraryRoot?: string | undefined;
        defaultTokenBudget?: number | undefined;
        onEvent?: Function | undefined;
    });
    evolverWorkbench: import("../evolver/evolver-workbench").EvolverWorkbench | null;
    p2pBus: import("./p2p-bus").P2PBus | null;
    experienceLibraryRoot: string | undefined;
    defaultTokenBudget: number;
    onEvent: Function | null;
    /** @type {SharedFinding[]} */
    findings: SharedFinding[];
    /** @type {FailureImmunization[]} */
    immunizations: FailureImmunization[];
    /**
     * @param {string} eventType
     * @param {any} payload
     */
    _emit(eventType: string, payload: any): void;
    /**
     * Publishes a reusable finding or architectural discovery into the shared pool
     * @param {Object} input
     * @param {string} input.agentId
     * @param {string} input.title
     * @param {string} input.content
     * @param {string | null} [input.taskId]
     * @param {string} [input.domain='general']
     * @param {string[]} [input.tags]
     * @returns {import('../result').UnitResult<SharedFinding>}
     */
    publishFinding(input: {
        agentId: string;
        title: string;
        content: string;
        taskId?: string | null | undefined;
        domain?: string | undefined;
        tags?: string[] | undefined;
    }): import("../result").UnitResult<SharedFinding>;
    /**
     * Broadcasts a failure log / pitfall to immediately immunize all active peer workers,
     * and bridges the lesson into the Experience-DB / Evolver library.
     * @param {Object} input
     * @param {string} input.agentId
     * @param {string} [input.taskId]
     * @param {string} [input.domain='general']
     * @param {string} [input.errorCode='UNKNOWN_ERROR']
     * @param {string} input.symptom
     * @param {string} [input.rootCause]
     * @param {string} input.mitigation
     * @param {boolean} [input.distillToExperienceDb=true]
     * @returns {import('../result').UnitResult<{ immunization: FailureImmunization, experienceDistilled: boolean, experiencePath: string | null }>}
     */
    broadcastFailure(input: {
        agentId: string;
        taskId?: string | undefined;
        domain?: string | undefined;
        errorCode?: string | undefined;
        symptom: string;
        rootCause?: string | undefined;
        mitigation: string;
        distillToExperienceDb?: boolean | undefined;
    }): import("../result").UnitResult<{
        immunization: FailureImmunization;
        experienceDistilled: boolean;
        experiencePath: string | null;
    }>;
    /**
     * Step 1 of the Agensh Worker Cooperation Loop (`Gather Context`):
     * Retrieves domain-relevant failure immunizations, locked interface contracts,
     * and peer findings while strictly enforcing `maxTokenBudget` via Headroom.
     * @param {Object} [options]
     * @param {string} [options.agentId]
     * @param {string} [options.taskId]
     * @param {string} [options.domain]
     * @param {string[]} [options.tags]
     * @param {number} [options.maxTokenBudget]
     * @returns {import('../result').UnitResult<{ findings: SharedFinding[], immunizations: FailureImmunization[], contracts: import('./p2p-bus').InterfaceContractLock[], totalTokens: number, maxTokenBudget: number, truncated: boolean }>}
     */
    gatherContext(options?: {
        agentId?: string | undefined;
        taskId?: string | undefined;
        domain?: string | undefined;
        tags?: string[] | undefined;
        maxTokenBudget?: number | undefined;
    }): import("../result").UnitResult<{
        findings: SharedFinding[];
        immunizations: FailureImmunization[];
        contracts: import("./p2p-bus").InterfaceContractLock[];
        totalTokens: number;
        maxTokenBudget: number;
        truncated: boolean;
    }>;
}
