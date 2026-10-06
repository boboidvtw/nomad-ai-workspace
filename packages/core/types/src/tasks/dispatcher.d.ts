export class TaskDispatcher {
    /**
     * @param {Object} [options]
     * @param {AgentRoster} [options.roster]
     * @param {number} [options.defaultLeaseDurationMs=30000]
     * @param {string} [options.storagePath]
     * @param {boolean} [options.autoPersist=false]
     * @param {Function} [options.onTaskEvent] - (eventType, task) => void
     */
    constructor(options?: {
        roster?: AgentRoster | undefined;
        defaultLeaseDurationMs?: number | undefined;
        storagePath?: string | undefined;
        autoPersist?: boolean | undefined;
        onTaskEvent?: Function | undefined;
    });
    roster: AgentRoster;
    defaultLeaseDurationMs: number;
    storagePath: string;
    autoPersist: boolean;
    onTaskEvent: Function | null;
    /** @type {Map<string, import('./task-model').Task>} */
    tasks: Map<string, import("./task-model").Task>;
    /**
     * Emits a task event and persists state if autoPersist is true
     * @param {string} eventType
     * @param {import('./task-model').Task} task
     */
    _notify(eventType: string, task: import("./task-model").Task): void;
    /**
     * Persists all tasks to disk atomically
     * @param {string} [customPath]
     * @returns {Promise<import('../result').UnitResult<{ persisted: boolean, path?: string, count: number }>>}
     */
    saveToDisk(customPath?: string): Promise<import("../result").UnitResult<{
        persisted: boolean;
        path?: string;
        count: number;
    }>>;
    /**
     * Loads tasks from disk and restores state, automatically resolving offline lease expiries
     * @param {string} [customPath]
     * @returns {import('../result').UnitResult<{ loaded: boolean, path?: string, count: number, reason?: string }>}
     */
    loadFromDisk(customPath?: string): import("../result").UnitResult<{
        loaded: boolean;
        path?: string;
        count: number;
        reason?: string;
    }>;
    /**
     * Creates and registers a new task
     * @param {Parameters<typeof createTaskEntity>[0]} input
     * @returns {import('../result').UnitResult<import('./task-model').Task>}
     */
    createTask(input: Parameters<typeof createTaskEntity>[0]): import("../result").UnitResult<import("./task-model").Task>;
    /**
     * Retrieves a task by ID
     * @param {string} id
     * @returns {import('../result').UnitResult<import('./task-model').Task>}
     */
    getTask(id: string): import("../result").UnitResult<import("./task-model").Task>;
    /**
     * Lists tasks with optional filters
     * @param {Object} [filter]
     * @param {string} [filter.status]
     * @param {string} [filter.assignee]
     * @param {string} [filter.priority]
     * @param {string} [filter.parentGoal]
     * @param {string} [filter.query] - Case-insensitive match on title, description, id and assignee
     * @returns {import('./task-model').Task[]}
     */
    listTasks(filter?: {
        status?: string | undefined;
        assignee?: string | undefined;
        priority?: string | undefined;
        parentGoal?: string | undefined;
        query?: string | undefined;
    }): import("./task-model").Task[];
    /**
     * Returns a complete DAG dependency graph of all tasks
     * Includes upstream dependencies, downstream blocked tasks, and topological health
     */
    getTaskGraph(): {
        nodes: {
            id: string;
            title: string;
            status: import("./task-model").TaskStatus;
            priority: import("./task-model").TaskPriority;
            assignee: string | null;
            dependencies: string[];
            unsatisfiedDependencies: string[];
            isBlocked: boolean;
            downstreamDependentIds: string[];
        }[];
        edges: {
            from: string;
            to: string;
            satisfied: boolean;
        }[];
        totalCount: number;
        blockedCount: number;
    };
    /**
     * Atomically claims a task for an agent with an exclusive lease
     * @param {string} taskId
     * @param {string} agentId
     * @param {number} [leaseDurationMs]
     * @returns {import('../result').UnitResult<import('./task-model').Task>}
     */
    claimTask(taskId: string, agentId: string, leaseDurationMs?: number): import("../result").UnitResult<import("./task-model").Task>;
    /**
     * Renews the heartbeat lease on an in-progress task
     * @param {string} taskId
     * @param {string} agentId
     * @param {number} [extendMs]
     * @returns {import('../result').UnitResult<import('./task-model').TaskLease>}
     */
    renewHeartbeat(taskId: string, agentId: string, extendMs?: number): import("../result").UnitResult<import("./task-model").TaskLease>;
    /**
     * Sweeps and reclaims tasks with expired heartbeat leases
     * @returns {string[]} List of reclaimed task IDs
     */
    checkExpiredLeases(): string[];
    /**
     * Marks a task as completed and automatically wakes up dependent tasks
     * @param {string} taskId
     * @param {string} agentId
     * @param {string} [summary]
     * @returns {import('../result').UnitResult<import('./task-model').Task>}
     */
    completeTask(taskId: string, agentId: string, summary?: string): import("../result").UnitResult<import("./task-model").Task>;
    /**
     * Marks a task as failed
     * @param {string} taskId
     * @param {string} agentId
     * @param {string} [reason]
     * @returns {import('../result').UnitResult<import('./task-model').Task>}
     */
    failTask(taskId: string, agentId: string, reason?: string): import("../result").UnitResult<import("./task-model").Task>;
    /**
     * Cancels a task
     * @param {string} taskId
     * @param {string} [reason]
     * @returns {import('../result').UnitResult<import('./task-model').Task>}
     */
    cancelTask(taskId: string, reason?: string): import("../result").UnitResult<import("./task-model").Task>;
    /**
     * Appends an artifact to the task
     * @param {string} taskId
     * @param {{ name?: string, type?: string, content?: string, uri?: string | null }} artifact
     * @returns {import('../result').UnitResult<import('./task-model').TaskArtifact>}
     */
    addArtifact(taskId: string, artifact: {
        name?: string;
        type?: string;
        content?: string;
        uri?: string | null;
    }): import("../result").UnitResult<import("./task-model").TaskArtifact>;
    /**
     * Appends a log entry to the task
     * @param {string} taskId
     * @param {{ level?: import('./task-model').TaskLog['level'], message: string }} log
     */
    appendLog(taskId: string, log: {
        level?: import("./task-model").TaskLog["level"];
        message: string;
    }): import("../result").UnitSuccess<boolean> | import("../result").UnitFailure<"TASK_NOT_FOUND_001">;
    /**
     * Private helper to check and unblock dependent tasks
     * @param {string} completedTaskId
     */
    _resolveDependencies(completedTaskId: string): void;
}
import { AgentRoster } from "./roster";
import { createTaskEntity } from "./task-model";
