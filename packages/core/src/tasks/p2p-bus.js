/**
 * Nomad Shared Core - Peer-to-Peer Negotiation Bus & Interface Lock Registry (Agensh RFC-0002 Module 3)
 * Enables direct worker-to-worker coordination (`agent:direct_message`) and deterministic
 * `[CONTRACT_LOCKED]` interface locking without routing through a central master LLM.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

const CONTRACT_LOCKED_REGEX = /\[CONTRACT_LOCKED\]\s*([^\s:]+)\s*:\s*(.+)/i;

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

class P2PBus {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxMessageHistory=500]
   * @param {Function} [options.onEvent] - (eventType: string, payload: any) => void
   */
  constructor(options = {}) {
    this.maxMessageHistory =
      typeof options.maxMessageHistory === 'number' && options.maxMessageHistory > 0
        ? options.maxMessageHistory
        : 500;
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
    /** @type {P2PDirectMessage[]} */
    this.messages = [];
    /** @type {Map<string, InterfaceContractLock>} */
    this.contracts = new Map();
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
   * Parses `[CONTRACT_LOCKED] <modulePath>: <signature>` from a message string
   * @param {string} text
   * @returns {{ modulePath: string, signature: string } | null}
   */
  parseContractLockedDirective(text) {
    if (typeof text !== 'string') return null;
    const match = text.match(CONTRACT_LOCKED_REGEX);
    if (!match) return null;
    const modulePath = String(match[1] || '').trim();
    const signature = String(match[2] || '').trim();
    if (!modulePath || !signature) return null;
    return { modulePath, signature };
  }

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
  lockInterfaceContract(input) {
    if (!input || typeof input !== 'object') {
      return err(ErrorCodes.P2P_CONTRACT_INVALID_002, 'Contract lock input must be an object');
    }

    const agentId = String(input.agentId || '').trim();
    const modulePath = String(input.modulePath || '').trim();
    const signature = String(input.signature || '').trim();
    if (!agentId || !modulePath || !signature) {
      return err(
        ErrorCodes.P2P_CONTRACT_INVALID_002,
        'agentId, modulePath, and signature are required to lock an interface contract',
      );
    }

    const existing = this.contracts.get(modulePath);
    if (existing && existing.ownerAgentId !== agentId && existing.signature !== signature) {
      const conflictPayload = {
        modulePath,
        ownerAgentId: existing.ownerAgentId,
        requestingAgentId: agentId,
        lockedSignature: existing.signature,
        proposedSignature: signature,
      };
      this._emit('p2p:contract_conflict', conflictPayload);
      return err(
        ErrorCodes.P2P_CONTRACT_CONFLICT_003,
        `Interface contract on '${modulePath}' is locked by '${existing.ownerAgentId}' with signature '${existing.signature}'. Direct P2P negotiation required before changing public contract.`,
        conflictPayload,
      );
    }

    const now = new Date().toISOString();
    /** @type {InterfaceContractLock} */
    const contract = {
      id: existing ? existing.id : `contract_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      modulePath,
      signature,
      ownerAgentId: agentId,
      taskId: input.taskId ? String(input.taskId) : existing?.taskId || null,
      description: String(input.description || '').trim(),
      lockedAt: existing ? existing.lockedAt : now,
      updatedAt: now,
    };

    this.contracts.set(modulePath, contract);
    this._emit('contract:locked', { ...contract });
    return ok({ ...contract });
  }

  /**
   * Validates whether a proposed module signature complies with active interface locks
   * @param {Object} input
   * @param {string} [input.agentId]
   * @param {string} input.modulePath
   * @param {string} input.proposedSignature
   * @returns {import('../result').UnitResult<{ valid: boolean, contract: InterfaceContractLock | null }>}
   */
  validateAgainstContracts(input) {
    if (!input || typeof input !== 'object' || !input.modulePath || !input.proposedSignature) {
      return err(
        ErrorCodes.P2P_CONTRACT_INVALID_002,
        'modulePath and proposedSignature are required for contract validation',
      );
    }

    const modulePath = String(input.modulePath).trim();
    const proposedSignature = String(input.proposedSignature).trim();
    const existing = this.contracts.get(modulePath);

    if (!existing) {
      return ok({ valid: true, contract: null });
    }

    if (existing.signature !== proposedSignature) {
      return err(
        ErrorCodes.P2P_CONTRACT_CONFLICT_003,
        `Proposed signature '${proposedSignature}' violates locked contract '${existing.signature}' on '${modulePath}' (owned by ${existing.ownerAgentId})`,
        { existing, proposedSignature },
      );
    }

    return ok({ valid: true, contract: { ...existing } });
  }

  /**
   * Releases an interface contract lock
   * @param {Object} input
   * @param {string} input.modulePath
   * @param {string} [input.agentId]
   * @param {boolean} [input.force=false]
   * @returns {import('../result').UnitResult<{ unlocked: boolean, modulePath: string }>}
   */
  unlockInterfaceContract(input) {
    if (!input || typeof input !== 'object' || !input.modulePath) {
      return err(ErrorCodes.P2P_CONTRACT_INVALID_002, 'modulePath is required to unlock contract');
    }

    const modulePath = String(input.modulePath).trim();
    const existing = this.contracts.get(modulePath);
    if (!existing) {
      return err(
        ErrorCodes.P2P_CONTRACT_NOT_FOUND_004,
        `No active interface contract found for '${modulePath}'`,
      );
    }

    if (!input.force && input.agentId && existing.ownerAgentId !== input.agentId) {
      return err(
        ErrorCodes.P2P_CONTRACT_CONFLICT_003,
        `Only owner '${existing.ownerAgentId}' can unlock '${modulePath}'`,
      );
    }

    this.contracts.delete(modulePath);
    this._emit('contract:unlocked', { modulePath, previousOwner: existing.ownerAgentId });
    return ok({ unlocked: true, modulePath });
  }

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
  sendDirectMessage(input) {
    if (!input || typeof input !== 'object') {
      return err(ErrorCodes.P2P_MESSAGE_INVALID_001, 'Direct message payload must be an object');
    }

    const fromAgentId = String(input.fromAgentId || '').trim();
    const toAgentId = String(input.toAgentId || '').trim();
    const content = String(input.content || '').trim();
    if (!fromAgentId || !toAgentId || !content) {
      return err(
        ErrorCodes.P2P_MESSAGE_INVALID_001,
        'fromAgentId, toAgentId, and content are required for P2P messaging',
      );
    }

    /** @type {InterfaceContractLock | null} */
    let lockedContract = null;
    const directive = this.parseContractLockedDirective(content);
    if (directive) {
      const lockRes = this.lockInterfaceContract({
        agentId: fromAgentId,
        taskId: input.taskId || null,
        modulePath: directive.modulePath,
        signature: directive.signature,
        description: content,
      });
      if (!lockRes.success) {
        return lockRes;
      }
      lockedContract = lockRes.data;
    }

    const now = new Date().toISOString();
    /** @type {P2PDirectMessage} */
    const msg = {
      id: `p2p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      fromAgentId,
      toAgentId,
      taskId: input.taskId ? String(input.taskId) : null,
      content,
      contractLocked: Boolean(lockedContract),
      contract: lockedContract,
      metadata: input.metadata || {},
      createdAt: now,
    };

    this.messages.push(msg);
    if (this.messages.length > this.maxMessageHistory) {
      this.messages.splice(0, this.messages.length - this.maxMessageHistory);
    }

    this._emit('agent:direct_message', { ...msg });
    return ok({ ...msg });
  }

  /**
   * Lists active interface contracts
   * @returns {InterfaceContractLock[]}
   */
  getContracts() {
    return Array.from(this.contracts.values()).map((c) => ({ ...c }));
  }

  /**
   * Lists peer-to-peer messages with optional filtering
   * @param {Object} [filter]
   * @param {string} [filter.agentId] - Matches either fromAgentId or toAgentId (or '*' broadcast)
   * @param {string} [filter.taskId]
   * @param {number} [filter.limit=100]
   * @returns {P2PDirectMessage[]}
   */
  getMessages(filter = {}) {
    let list = [...this.messages];
    if (filter.agentId) {
      const a = String(filter.agentId).trim();
      list = list.filter(
        (m) => m.fromAgentId === a || m.toAgentId === a || m.toAgentId === '*',
      );
    }
    if (filter.taskId) {
      const t = String(filter.taskId).trim();
      list = list.filter((m) => m.taskId === t);
    }
    const limit = typeof filter.limit === 'number' && filter.limit > 0 ? filter.limit : 100;
    return list.slice(-limit).map((m) => ({ ...m }));
  }
}

module.exports = {
  CONTRACT_LOCKED_REGEX,
  P2PBus,
};
