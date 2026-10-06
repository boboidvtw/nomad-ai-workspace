export const AGENT_STATUS: Readonly<{
    IDLE: "idle";
    BUSY: "busy";
    PAUSED: "paused";
    OFFLINE: "offline";
}>;
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
    /** @type {Map<string, Object>} */
    agents: Map<string, any>;
    /**
     * Registers or updates an agent profile
     * @param {Object} profile
     * @returns {import('../result').UnitResult<Object, string>}
     */
    registerAgent(profile: any): import("../result").UnitResult<any, string>;
    /**
     * Retrieves an agent by ID
     * @param {string} id
     * @returns {import('../result').UnitResult<Object, string>}
     */
    getAgent(id: string): import("../result").UnitResult<any, string>;
    /**
     * Lists all registered agents
     * @returns {Object[]}
     */
    listAgents(): any[];
    /**
     * Updates an agent's status
     * @param {string} id
     * @param {string} status
     * @returns {import('../result').UnitResult<Object, string>}
     */
    updateAgentStatus(id: string, status: string): import("../result").UnitResult<any, string>;
    /**
     * Finds the best agent matching a set of required skills
     * @param {string[]} requiredSkills
     * @returns {import('../result').UnitResult<Object, string>}
     */
    findBestAgentForSkills(requiredSkills?: string[]): import("../result").UnitResult<any, string>;
}
