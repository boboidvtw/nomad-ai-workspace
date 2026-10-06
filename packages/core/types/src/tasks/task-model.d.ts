export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];
export type TaskPriority = (typeof TASK_PRIORITY)[keyof typeof TASK_PRIORITY];
export type TaskLease = {
    agentId: string;
    acquiredAt: string;
    expiresAt: string;
};
export type TaskReviewGate = {
    requestedAt: string;
    requestedBy: string;
    proposal: string;
    diff: string | null;
    status: "pending" | "approved" | "rejected";
    reviewer: string | null;
    decision: "approve" | "reject" | null;
    feedback: string | null;
    decidedAt: string | null;
};
export type TaskArtifact = {
    id: string;
    name: string;
    type: string;
    content: string;
    uri: string | null;
    createdAt: string;
};
export type TaskLog = {
    timestamp: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
};
export type Task = {
    id: string;
    title: string;
    description: string;
    parentGoal: string;
    /**
     * - Ids of tasks that must complete first
     */
    dependencies: string[];
    priority: TaskPriority;
    status: TaskStatus;
    assignee: string | null;
    acceptanceCriteria: string[];
    requireApproval: boolean;
    metadata: Record<string, unknown>;
    lease: TaskLease | null;
    reviewGate: TaskReviewGate | null;
    artifacts: TaskArtifact[];
    logs: TaskLog[];
    createdAt: string;
    updatedAt: string;
};
export const TASK_STATUS: Readonly<{
    TODO: "todo";
    IN_PROGRESS: "in_progress";
    REVIEW: "review";
    COMPLETED: "completed";
    FAILED: "failed";
    BLOCKED: "blocked";
    CANCELLED: "cancelled";
}>;
export const TASK_PRIORITY: Readonly<{
    LOW: "low";
    MEDIUM: "medium";
    HIGH: "high";
    URGENT: "urgent";
}>;
export namespace VALID_TRANSITIONS {
    let todo: ("in_progress" | "blocked" | "cancelled")[];
    let blocked: ("todo" | "cancelled")[];
    let in_progress: ("review" | "completed" | "failed" | "cancelled")[];
    let review: ("in_progress" | "completed" | "failed" | "cancelled")[];
    let failed: ("todo" | "cancelled")[];
    let completed: never[];
    let cancelled: never[];
}
/**
 * Validates a state transition against the task state machine
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @returns {import('../result').UnitResult<boolean, string>}
 */
export function validateTransition(currentStatus: string, nextStatus: string): import("../result").UnitResult<boolean, string>;
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
export function createTaskEntity(input: {
    title: string;
    id?: string | undefined;
    description?: string | undefined;
    parentGoal?: string | undefined;
    dependencies?: string[] | undefined;
    priority?: string | undefined;
    assignee?: string | undefined;
    acceptanceCriteria?: string[] | undefined;
    requireApproval?: boolean | undefined;
    metadata?: Record<string, unknown> | undefined;
}): import("../result").UnitResult<Task>;
