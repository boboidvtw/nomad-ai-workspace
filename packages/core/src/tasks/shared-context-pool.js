/**
 * Nomad Shared Core - Shared Context Pool & Failure Log Immunization (Agensh RFC-0002 Module 4)
 * Retains reusable findings, work intentions, and failure immunizations so concurrent workers
 * build upon peer progress without duplicate trial-and-error.
 * Bridges into Headroom token compression and Evolver/Experience-DB distillation.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { estimateTokens, compress } = require('../pipeline/headroom');
const { distillDomainExperience } = require('../evolver/evolver-workbench');

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

class SharedContextPool {
  /**
   * @param {Object} [options]
   * @param {import('../evolver/evolver-workbench').EvolverWorkbench | null} [options.evolverWorkbench]
   * @param {import('./p2p-bus').P2PBus | null} [options.p2pBus]
   * @param {string} [options.experienceLibraryRoot]
   * @param {number} [options.defaultTokenBudget=4000]
   * @param {Function} [options.onEvent] - (eventType: string, payload: any) => void
   */
  constructor(options = {}) {
    this.evolverWorkbench = options.evolverWorkbench || null;
    this.p2pBus = options.p2pBus || null;
    this.experienceLibraryRoot = options.experienceLibraryRoot || undefined;
    this.defaultTokenBudget =
      typeof options.defaultTokenBudget === 'number' && options.defaultTokenBudget > 0
        ? options.defaultTokenBudget
        : 4000;
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;

    /** @type {SharedFinding[]} */
    this.findings = [];
    /** @type {FailureImmunization[]} */
    this.immunizations = [];
  }

  /**
   * @param {string} eventType
   * @param {any} payload
   */
  _emit(eventType, payload) {
    if (this.onEvent) {
      try {
        this.onEvent(eventType, payload);
      } catch {}
    }
  }

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
  publishFinding(input) {
    if (!input || typeof input !== 'object') {
      return err(ErrorCodes.CONTEXT_FINDING_INVALID_001, 'Finding input must be an object');
    }

    const agentId = String(input.agentId || '').trim();
    const title = String(input.title || '').trim();
    const content = String(input.content || '').trim();
    if (!agentId || !title || !content) {
      return err(
        ErrorCodes.CONTEXT_FINDING_INVALID_001,
        'agentId, title, and content are required to publish a shared finding',
      );
    }

    const domain = String(input.domain || 'general').trim();
    const tags = Array.isArray(input.tags)
      ? input.tags.map((t) => String(t).trim()).filter(Boolean)
      : [];
    const tokens = estimateTokens(`${title}\n${content}`);
    const now = new Date().toISOString();

    /** @type {SharedFinding} */
    const finding = {
      id: `finding_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      agentId,
      taskId: input.taskId ? String(input.taskId) : null,
      domain,
      title,
      content,
      tags,
      tokens,
      createdAt: now,
    };

    this.findings.push(finding);
    this._emit('context:finding_published', { ...finding });
    return ok({ ...finding });
  }

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
  broadcastFailure(input) {
    if (!input || typeof input !== 'object') {
      return err(
        ErrorCodes.CONTEXT_FAILURE_INVALID_002,
        'Failure broadcast input must be an object',
      );
    }

    const agentId = String(input.agentId || '').trim();
    const symptom = String(input.symptom || '').trim();
    const mitigation = String(input.mitigation || '').trim();
    if (!agentId || !symptom || !mitigation) {
      return err(
        ErrorCodes.CONTEXT_FAILURE_INVALID_002,
        'agentId, symptom, and mitigation are required to broadcast a failure log',
      );
    }

    const taskId = String(input.taskId || `task_${Date.now()}`).trim();
    const domain = String(input.domain || 'general').trim();
    const errorCode = String(input.errorCode || 'TASK_EXECUTION_FAILED_007').trim();
    const rootCause = String(input.rootCause || symptom).trim();
    const tokens = estimateTokens(`${errorCode}: ${symptom} -> ${mitigation}`);
    const now = new Date().toISOString();

    /** @type {FailureImmunization} */
    const immunization = {
      id: `imm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      agentId,
      taskId,
      domain,
      errorCode,
      symptom,
      rootCause,
      mitigation,
      tokens,
      createdAt: now,
    };

    this.immunizations.push(immunization);

    let experienceDistilled = false;
    /** @type {string | null} */
    let experiencePath = null;
    const shouldDistill =
      input.distillToExperienceDb !== undefined
        ? Boolean(input.distillToExperienceDb)
        : Boolean(this.evolverWorkbench || this.experienceLibraryRoot);

    if (shouldDistill) {
      const distillRes = distillDomainExperience(
        {
          domain,
          taskId,
          cue: `[${errorCode}] ${symptom}`,
          lesson: mitigation,
          evidence: `Root cause identified by ${agentId}: ${rootCause}`,
          confidence: 0.92,
        },
        this.experienceLibraryRoot ? { libraryRoot: this.experienceLibraryRoot } : {},
      );
      if (distillRes.success) {
        experienceDistilled = true;
        experiencePath = distillRes.data.experiencePath;
      }
    }

    this._emit('context:failure_broadcast', {
      immunization: { ...immunization },
      experienceDistilled,
      experiencePath,
    });

    return ok({
      immunization: { ...immunization },
      experienceDistilled,
      experiencePath,
    });
  }

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
  gatherContext(options = {}) {
    try {
      const budget =
        typeof options.maxTokenBudget === 'number' && options.maxTokenBudget > 0
          ? options.maxTokenBudget
          : this.defaultTokenBudget;
      const domainFilter = options.domain ? String(options.domain).trim().toLowerCase() : null;
      const tagSet =
        Array.isArray(options.tags) && options.tags.length > 0
          ? new Set(options.tags.map((t) => String(t).trim().toLowerCase()))
          : null;

      let totalTokens = 0;
      let truncated = false;

      // Priority 1: Active Interface Contracts from P2PBus
      const allContracts = this.p2pBus ? this.p2pBus.getContracts() : [];
      /** @type {import('./p2p-bus').InterfaceContractLock[]} */
      const selectedContracts = [];
      for (const c of allContracts) {
        const cTokens = estimateTokens(`[CONTRACT_LOCKED] ${c.modulePath}: ${c.signature}`);
        if (totalTokens + cTokens <= budget) {
          selectedContracts.push(c);
          totalTokens += cTokens;
        } else {
          truncated = true;
        }
      }

      // Priority 2: Failure Immunizations (most recent first)
      const matchingImmunizations = [...this.immunizations].reverse().filter((imm) => {
        if (!domainFilter) return true;
        return imm.domain.toLowerCase() === domainFilter || imm.domain === 'general';
      });

      /** @type {FailureImmunization[]} */
      const selectedImmunizations = [];
      for (const imm of matchingImmunizations) {
        if (totalTokens + imm.tokens <= budget) {
          selectedImmunizations.push({ ...imm });
          totalTokens += imm.tokens;
        } else {
          truncated = true;
        }
      }

      // Priority 3: Shared Peer Findings (most recent first)
      const matchingFindings = [...this.findings].reverse().filter((f) => {
        if (
          domainFilter &&
          f.domain.toLowerCase() !== domainFilter &&
          f.domain.toLowerCase() !== 'general'
        ) {
          return false;
        }
        if (tagSet) {
          const hasTag = f.tags.some((t) => tagSet.has(t.toLowerCase()));
          if (!hasTag) return false;
        }
        return true;
      });

      /** @type {SharedFinding[]} */
      const selectedFindings = [];
      for (const f of matchingFindings) {
        if (totalTokens + f.tokens <= budget) {
          selectedFindings.push({ ...f });
          totalTokens += f.tokens;
        } else {
          // Attempt Headroom compression if remaining budget is at least 40 tokens
          const remaining = budget - totalTokens;
          if (remaining >= 40) {
            const compRes = compress(f.content, { level: 'aggressive', maxTokens: remaining });
            if (compRes.success && compRes.data.compressedTokens <= remaining) {
              selectedFindings.push({
                ...f,
                content: compRes.data.text,
                tokens: compRes.data.compressedTokens,
              });
              totalTokens += compRes.data.compressedTokens;
              truncated = true;
              continue;
            }
          }
          truncated = true;
        }
      }

      return ok({
        findings: selectedFindings,
        immunizations: selectedImmunizations,
        contracts: selectedContracts,
        totalTokens,
        maxTokenBudget: budget,
        truncated,
      });
    } catch (e) {
      return err(
        ErrorCodes.CONTEXT_GATHER_FAILED_003,
        `Failed to gather shared context: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

module.exports = {
  SharedContextPool,
};
