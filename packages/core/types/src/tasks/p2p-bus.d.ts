export type P2PDirectMessage = {
    id: string;
    fromAgentId: string;
    toAgentId: string;
    taskId: string | null;
    content: string;
    contractLocked: boolean;
    contract: InterfaceContractLock | null;
    metadata: Record<string, unknown>;
    createdAt: string;
};
export type InterfaceContractLock = {
    id: string;
    modulePath: string;
    signature: string;
    ownerAgentId: string;
    taskId: string | null;
    description: string;
    lockedAt: string;
    updatedAt: string;
};
export const CONTRACT_LOCKED_REGEX: RegExp;
/**
 * @typedef {Object} P2PDirectMessage
 * @property {string} id
 * @property {string} fromAgentId
 * @property {string} toAgentId
 * @property {string | null} taskId
 * @property {string} content
 * @property {boolean} contractLocked
 * @property {InterfaceContractLock | null} contract
 * @property {Record<string, unknown>} metadata
 * @property {string} createdAt
 */
/**
 * @typedef {Object} InterfaceContractLock
 * @property {string} id
 * @property {string} modulePath
 * @property {string} signature
 * @property {string} ownerAgentId
 * @property {string | null} taskId
 * @property {string} description
 * @property {string} lockedAt
 * @property {string} updatedAt
 */
export class P2PBus {
    /**
     * @param {Object} [options]
     * @param {number} [options.maxMessageHistory=500]
     * @param {Function} [options.onEvent] - (eventType: string, payload: any) => void
     */
    constructor(options?: {
        maxMessageHistory?: number | undefined;
        onEvent?: Function | undefined;
    });
    maxMessageHistory: number;
    onEvent: Function | null;
    /** @type {P2PDirectMessage[]} */
    messages: P2PDirectMessage[];
    /** @type {Map<string, InterfaceContractLock>} */
    contracts: Map<string, InterfaceContractLock>;
    /**
     * @param {string} eventType
     * @param {any} payload
     */
    _emit(eventType: string, payload: any): void;
    /**
     * Parses `[CONTRACT_LOCKED] <modulePath>: <signature>` from a message string
     * @param {string} text
     * @returns {{ modulePath: string, signature: string } | null}
     */
    parseContractLockedDirective(text: string): {
        modulePath: string;
        signature: string;
    } | null;
    /**
     * Locks a public interface contract for a specific module path
     * @param {Object} input
     * @param {string} input.agentId
     * @param {string} input.modulePath
     * @param {string} input.signature
     * @param {string | null} [input.taskId]
     * @param {string} [input.description]
     * @returns {import('../result').UnitResult<InterfaceContractLock>}
     */
    lockInterfaceContract(input: {
        agentId: string;
        modulePath: string;
        signature: string;
        taskId?: string | null | undefined;
        description?: string | undefined;
    }): import("../result").UnitResult<InterfaceContractLock>;
    /**
     * Validates whether a proposed module signature complies with active interface locks
     * @param {Object} input
     * @param {string} [input.agentId]
     * @param {string} input.modulePath
     * @param {string} input.proposedSignature
     * @returns {import('../result').UnitResult<{ valid: boolean, contract: InterfaceContractLock | null }>}
     */
    validateAgainstContracts(input: {
        agentId?: string | undefined;
        modulePath: string;
        proposedSignature: string;
    }): import("../result").UnitResult<{
        valid: boolean;
        contract: InterfaceContractLock | null;
    }>;
    /**
     * Releases an interface contract lock
     * @param {Object} input
     * @param {string} input.modulePath
     * @param {string} [input.agentId]
     * @param {boolean} [input.force=false]
     * @returns {import('../result').UnitResult<{ unlocked: boolean, modulePath: string }>}
     */
    unlockInterfaceContract(input: {
        modulePath: string;
        agentId?: string | undefined;
        force?: boolean | undefined;
    }): import("../result").UnitResult<{
        unlocked: boolean;
        modulePath: string;
    }>;
    /**
     * Sends a direct peer-to-peer message between worker agents.
     * Automatically parses and locks `[CONTRACT_LOCKED]` directives if present.
     * @param {Object} input
     * @param {string} input.fromAgentId
     * @param {string} input.toAgentId
     * @param {string} input.content
     * @param {string | null} [input.taskId]
     * @param {Record<string, unknown>} [input.metadata]
     * @returns {import('../result').UnitResult<P2PDirectMessage>}
     */
    sendDirectMessage(input: {
        fromAgentId: string;
        toAgentId: string;
        content: string;
        taskId?: string | null | undefined;
        metadata?: Record<string, unknown> | undefined;
    }): import("../result").UnitResult<P2PDirectMessage>;
    /**
     * Lists active interface contracts
     * @returns {InterfaceContractLock[]}
     */
    getContracts(): InterfaceContractLock[];
    /**
     * Lists peer-to-peer messages with optional filtering
     * @param {Object} [filter]
     * @param {string} [filter.agentId] - Matches either fromAgentId or toAgentId (or '*' broadcast)
     * @param {string} [filter.taskId]
     * @param {number} [filter.limit=100]
     * @returns {P2PDirectMessage[]}
     */
    getMessages(filter?: {
        agentId?: string | undefined;
        taskId?: string | undefined;
        limit?: number | undefined;
    }): P2PDirectMessage[];
}
