/**
 * Nomad Shared Core - Task Model & Entity Definitions
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

const TASK_STATUS = Object.freeze({
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  COMPLETED: 'completed',
  FAILED: 'failed',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled',
});

const TASK_PRIORITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
});

/** @typedef {(typeof TASK_STATUS)[keyof typeof TASK_STATUS]} TaskStatus */
/** @typedef {(typeof TASK_PRIORITY)[keyof typeof TASK_PRIORITY]} TaskPriority */

/**
 * @typedef {Object} TaskLease
 * @property {string} agentId
 * @property {string} acquiredAt
 * @property {string} expiresAt
 */

/**
 * @typedef {Object} TaskReviewGate
 * @property {string} requestedAt
 * @property {string} requestedBy
 * @property {string} proposal
 * @property {string | null} diff
 * @property {'pending' | 'approved' | 'rejected'} status
 * @property {string | null} reviewer
 * @property {'approve' | 'reject' | null} decision
 * @property {string | null} feedback
 * @property {string | null} decidedAt
 */

/**
 * @typedef {Object} TaskArtifact
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {string} content
 * @property {string | null} uri
 * @property {string} createdAt
 */

/**
 * @typedef {Object} TaskLog
 * @property {string} timestamp
 * @property {'debug' | 'info' | 'warn' | 'error'} level
 * @property {string} message
 */

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {string} parentGoal
 * @property {string[]} dependencies - Ids of tasks that must complete first
 * @property {TaskPriority} priority
 * @property {TaskStatus} status
 * @property {string | null} assignee
 * @property {string[]} acceptanceCriteria
 * @property {boolean} requireApproval
 * @property {Record<string, unknown>} metadata
 * @property {TaskLease | null} lease
 * @property {TaskReviewGate | null} reviewGate
 * @property {TaskArtifact[]} artifacts
 * @property {TaskLog[]} logs
 * @property {string} createdAt
 * @property {string} updatedAt
 */

const VALID_TRANSITIONS = {
  [TASK_STATUS.TODO]: [TASK_STATUS.IN_PROGRESS, TASK_STATUS.BLOCKED, TASK_STATUS.CANCELLED],
  [TASK_STATUS.BLOCKED]: [TASK_STATUS.TODO, TASK_STATUS.CANCELLED],
  [TASK_STATUS.IN_PROGRESS]: [
    TASK_STATUS.REVIEW,
    TASK_STATUS.COMPLETED,
    TASK_STATUS.FAILED,
    TASK_STATUS.CANCELLED,
  ],
  [TASK_STATUS.REVIEW]: [
    TASK_STATUS.COMPLETED,
    TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.FAILED,
    TASK_STATUS.CANCELLED,
  ],
  [TASK_STATUS.FAILED]: [TASK_STATUS.TODO, TASK_STATUS.CANCELLED],
  [TASK_STATUS.COMPLETED]: [],
  [TASK_STATUS.CANCELLED]: [],
};

/**
 * Validates a state transition against the task state machine
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @returns {import('../result').UnitResult<boolean, string>}
 */
function validateTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return ok(true);
  }
  const allowed = /** @type {Record<string, string[]>} */ (VALID_TRANSITIONS)[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    return err(
      ErrorCodes.TASK_INVALID_STATE_TRANSITION_004,
      `Cannot transition task status from '${currentStatus}' to '${nextStatus}'. Allowed: [${allowed.join(', ')}]`,
    );
  }
  return ok(true);
}

/**
 * Creates a normalized task entity with unique ID and timestamps
 * @param {Object} input
 * @param {string} input.title
 * @param {string} [input.id] - Preserved when restoring a persisted task
 * @param {string} [input.description]
 * @param {string} [input.parentGoal]
 * @param {string[]} [input.dependencies]
 * @param {string} [input.priority]
 * @param {string} [input.assignee]
 * @param {string[]} [input.acceptanceCriteria]
 * @param {boolean} [input.requireApproval]
 * @param {Record<string, unknown>} [input.metadata]
 * @returns {import('../result').UnitResult<Task>}
 */
function createTaskEntity(input) {
  if (!input || typeof input !== 'object') {
    return err(ErrorCodes.TASK_INVALID_PAYLOAD_002, 'Task payload must be a non-null object');
  }

  const title = (input.title || '').trim();
  if (!title) {
    return err(ErrorCodes.TASK_INVALID_PAYLOAD_002, 'Task title is required');
  }

  /** @type {TaskPriority} */
  const priority = /** @type {Array<string | undefined>} */ (Object.values(TASK_PRIORITY)).includes(
    input.priority,
  )
    ? /** @type {TaskPriority} */ (input.priority)
    : TASK_PRIORITY.MEDIUM;

  const dependencies = Array.isArray(input.dependencies)
    ? [...new Set(input.dependencies.filter(Boolean))]
    : [];

  const acceptanceCriteria = Array.isArray(input.acceptanceCriteria)
    ? input.acceptanceCriteria.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const now = new Date().toISOString();
  const id = input.id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  /** @type {Task} */
  const task = {
    id,
    title,
    description: (input.description || '').trim(),
    parentGoal: (input.parentGoal || '').trim(),
    dependencies,
    priority,
    status: dependencies.length > 0 ? TASK_STATUS.BLOCKED : TASK_STATUS.TODO,
    assignee: input.assignee || null,
    acceptanceCriteria,
    requireApproval: Boolean(input.requireApproval),
    metadata: input.metadata || {},
    lease: null, // { agentId: string, acquiredAt: string, expiresAt: string }
    reviewGate: null, // { requestedAt: string, decision: string, feedback: string, decidedAt: string }
    artifacts: [], // [{ id, name, type, content, uri, createdAt }]
    logs: [
      {
        timestamp: now,
        level: 'info',
        message: `Task initialized with status: ${dependencies.length > 0 ? TASK_STATUS.BLOCKED : TASK_STATUS.TODO}`,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  return ok(task);
}

module.exports = {
  TASK_STATUS,
  TASK_PRIORITY,
  VALID_TRANSITIONS,
  validateTransition,
  createTaskEntity,
};
