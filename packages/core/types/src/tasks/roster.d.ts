export type AgentStatus = (typeof AGENT_STATUS)[keyof typeof AGENT_STATUS];
export type Agent = {
    id: string;
    name: string;
    role: string;
    /**
     * - Webview platform id or 'local-model'
     */
    platform: string;
    skills: string[];
    status: AgentStatus;
    maxConcurrency: number;
    budgetTokenLimit: number;
    currentTaskIds: string[];
};
export const AGENT_STATUS: Readonly<{
    IDLE: "idle";
    BUSY: "busy";
    PAUSED: "paused";
    OFFLINE: "offline";
}>;
/** @typedef {(typeof AGENT_STATUS)[keyof typeof AGENT_STATUS]} AgentStatus */
/**
 * @typedef {Object} Agent
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {string} platform - Webview platform id or 'local-model'
 * @property {string[]} skills
 * @property {AgentStatus} status
 * @property {number} maxConcurrency
 * @property {number} budgetTokenLimit
 * @property {string[]} currentTaskIds
 */
export const DEFAULT_ROSTER: {
    id: string;
    name: string;
    role: string;
    platform: string;
    skills: string[];
    status: "idle";
    maxConcurrency: number;
    budgetTokenLimit: number;
    currentTaskIds: never[];
}[];
export class AgentRoster {
    constructor(initialAgents?: {
        id: string;
        name: string;
        role: string;
        platform: string;
        skills: string[];
        status: "idle";
        maxConcurrency: number;
        budgetTokenLimit: number;
        currentTaskIds: never[];
    }[]);
    /** @type {Map<string, import('./roster').Agent>} */
    agents: Map<string, import("./roster").Agent>;
    /**
     * Registers or updates an agent profile
     * @param {Partial<Agent>} profile
     * @returns {import('../result').UnitResult<import('./roster').Agent>}
     */
    registerAgent(profile: Partial<Agent>): import("../result").UnitResult<import("./roster").Agent>;
    /**
     * Retrieves an agent by ID
     * @param {string} id
     * @returns {import('../result').UnitResult<import('./roster').Agent>}
     */
    getAgent(id: string): import("../result").UnitResult<import("./roster").Agent>;
    /**
     * Lists all registered agents
     * @returns {import('./roster').Agent[]}
     */
    listAgents(): import("./roster").Agent[];
    /**
     * Updates an agent's status
     * @param {string} id
     * @param {string} status
     * @returns {import('../result').UnitResult<import('./roster').Agent>}
     */
    updateAgentStatus(id: string, status: string): import("../result").UnitResult<import("./roster").Agent>;
    /**
     * Finds the best agent matching a set of required skills
     * @param {string[]} requiredSkills
     * @returns {import('../result').UnitResult<import('./roster').Agent>}
     */
    findBestAgentForSkills(requiredSkills?: string[]): import("../result").UnitResult<import("./roster").Agent>;
}
