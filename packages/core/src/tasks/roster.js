/**
 * Nomad Shared Core - Agent Org Roster
 * Defines agent profiles, capabilities, platform affinities, and status.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

const AGENT_STATUS = Object.freeze({
  IDLE: 'idle',
  BUSY: 'busy',
  PAUSED: 'paused',
  OFFLINE: 'offline',
});

const DEFAULT_ROSTER = [
  {
    id: 'agent-claude',
    name: 'Claude Lead Architect',
    role: 'Lead System Architect',
    platform: 'claude',
    skills: ['architecture', 'system-design', 'refactoring', 'code-review', 'typescript'],
    status: AGENT_STATUS.IDLE,
    maxConcurrency: 1,
    budgetTokenLimit: 100000,
    currentTaskIds: [],
  },
  {
    id: 'agent-chatgpt',
    name: 'ChatGPT Core Engineer',
    role: 'Senior Fullstack Engineer',
    platform: 'chatgpt',
    skills: ['fullstack', 'api-design', 'business-logic', 'algorithms', 'javascript'],
    status: AGENT_STATUS.IDLE,
    maxConcurrency: 1,
    budgetTokenLimit: 100000,
    currentTaskIds: [],
  },
  {
    id: 'agent-gemini',
    name: 'Gemini Research & Docs',
    role: 'Research & Documentation Specialist',
    platform: 'gemini',
    skills: ['research', 'documentation', 'audit', 'deep-analysis', 'i18n'],
    status: AGENT_STATUS.IDLE,
    maxConcurrency: 1,
    budgetTokenLimit: 100000,
    currentTaskIds: [],
  },
  {
    id: 'agent-grok',
    name: 'Grok QA & Security',
    role: 'QA & Security Auditor',
    platform: 'grok',
    skills: ['security', 'edge-case-testing', 'boundary-audit', 'fuzzing'],
    status: AGENT_STATUS.IDLE,
    maxConcurrency: 1,
    budgetTokenLimit: 100000,
    currentTaskIds: [],
  },
  {
    id: 'agent-local',
    name: 'LM Studio Local Runner',
    role: 'Local Offline Inference & Triage',
    platform: 'local-model',
    skills: ['local-inference', 'data-cleaning', 'fast-triage', 'offline'],
    status: AGENT_STATUS.IDLE,
    maxConcurrency: 2,
    budgetTokenLimit: 500000,
    currentTaskIds: [],
  },
];

class AgentRoster {
  constructor(initialAgents = DEFAULT_ROSTER) {
    /** @type {Map<string, Object>} */
    this.agents = new Map();
    for (const a of initialAgents) {
      this.agents.set(a.id, { ...a, currentTaskIds: [...(a.currentTaskIds || [])] });
    }
  }

  /**
   * Registers or updates an agent profile
   * @param {Object} profile 
   * @returns {import('../result').UnitResult<Object, string>}
   */
  registerAgent(profile) {
    if (!profile || typeof profile !== 'object') {
      return err(ErrorCodes.ROSTER_INVALID_PROFILE_002, 'Agent profile must be an object');
    }
    const id = (profile.id || '').trim();
    const name = (profile.name || '').trim();
    if (!id || !name) {
      return err(ErrorCodes.ROSTER_INVALID_PROFILE_002, 'Agent id and name are required');
    }

    const agent = {
      id,
      name,
      role: (profile.role || 'General Assistant').trim(),
      platform: profile.platform || 'claude',
      skills: Array.isArray(profile.skills) ? profile.skills : [],
      status: Object.values(AGENT_STATUS).includes(profile.status) ? profile.status : AGENT_STATUS.IDLE,
      maxConcurrency: typeof profile.maxConcurrency === 'number' ? profile.maxConcurrency : 1,
      budgetTokenLimit: typeof profile.budgetTokenLimit === 'number' ? profile.budgetTokenLimit : 100000,
      currentTaskIds: Array.isArray(profile.currentTaskIds) ? [...profile.currentTaskIds] : [],
    };

    this.agents.set(id, agent);
    return ok(agent);
  }

  /**
   * Retrieves an agent by ID
   * @param {string} id 
   * @returns {import('../result').UnitResult<Object, string>}
   */
  getAgent(id) {
    const agent = this.agents.get(id);
    if (!agent) {
      return err(ErrorCodes.ROSTER_AGENT_NOT_FOUND_001, `Agent with id '${id}' not found in roster`);
    }
    return ok({ ...agent });
  }

  /**
   * Lists all registered agents
   * @returns {Object[]}
   */
  listAgents() {
    return Array.from(this.agents.values()).map(a => ({ ...a }));
  }

  /**
   * Updates an agent's status
   * @param {string} id 
   * @param {string} status 
   * @returns {import('../result').UnitResult<Object, string>}
   */
  updateAgentStatus(id, status) {
    const agent = this.agents.get(id);
    if (!agent) {
      return err(ErrorCodes.ROSTER_AGENT_NOT_FOUND_001, `Agent with id '${id}' not found`);
    }
    if (!Object.values(AGENT_STATUS).includes(status)) {
      return err(ErrorCodes.ROSTER_INVALID_PROFILE_002, `Invalid status: '${status}'`);
    }
    agent.status = status;
    return ok({ ...agent });
  }

  /**
   * Finds the best agent matching a set of required skills
   * @param {string[]} requiredSkills 
   * @returns {import('../result').UnitResult<Object, string>}
   */
  findBestAgentForSkills(requiredSkills = []) {
    if (!Array.isArray(requiredSkills) || requiredSkills.length === 0) {
      // Pick first idle agent
      const idle = Array.from(this.agents.values()).find(a => a.status === AGENT_STATUS.IDLE);
      if (idle) return ok({ ...idle });
      return ok({ ...this.agents.values().next().value });
    }

    let bestScore = -1;
    let bestAgent = null;

    for (const agent of this.agents.values()) {
      if (agent.status === AGENT_STATUS.OFFLINE) continue;

      let score = 0;
      for (const skill of requiredSkills) {
        if (agent.skills.includes(skill)) {
          score += 10;
        }
      }

      // Bonus if idle
      if (agent.status === AGENT_STATUS.IDLE) {
        score += 5;
      }

      // Penalty if already at concurrency limit
      if (agent.currentTaskIds.length >= agent.maxConcurrency) {
        score -= 20;
      }

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    if (!bestAgent) {
      return err(ErrorCodes.ROSTER_AGENT_NOT_FOUND_001, 'No suitable agent found for skills');
    }
    return ok({ ...bestAgent });
  }
}

module.exports = {
  AGENT_STATUS,
  DEFAULT_ROSTER,
  AgentRoster,
};
