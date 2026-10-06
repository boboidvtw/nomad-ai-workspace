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
    /** @type {Map<string, Object>} */
    tasks: Map<string, any>;
    /**
     * Emits a task event and persists state if autoPersist is true
     * @param {string} eventType
     * @param {Object} task
     */
    _notify(eventType: string, task: any): void;
    /**
     * Persists all tasks to disk atomically
     * @param {string} [customPath]
     * @returns {Promise<import('../result').UnitResult<Object, string>>}
     */
    saveToDisk(customPath?: string): Promise<import("../result").UnitResult<any, string>>;
    /**
     * Loads tasks from disk and restores state, automatically resolving offline lease expiries
     * @param {string} [customPath]
     * @returns {import('../result').UnitResult<Object, string>}
     */
    loadFromDisk(customPath?: string): import("../result").UnitResult<any, string>;
    /**
     * Creates and registers a new task
     * @param {Object} input
     * @returns {import('../result').UnitResult<Object, string>}
     */
    createTask(input: any): import("../result").UnitResult<any, string>;
    /**
     * Retrieves a task by ID
     * @param {string} id
     * @returns {import('../result').UnitResult<Object, string>}
     */
    getTask(id: string): import("../result").UnitResult<any, string>;
    /**
     * Lists tasks with optional filters
     * @param {Object} [filter]
     * @param {string} [filter.status]
     * @param {string} [filter.assignee]
     * @param {string} [filter.priority]
     * @param {string} [filter.parentGoal]
     * @param {string} [filter.query] - Case-insensitive match on title, description, id and assignee
     * @returns {Object[]}
     */
    listTasks(filter?: {
        status?: string | undefined;
        assignee?: string | undefined;
        priority?: string | undefined;
        parentGoal?: string | undefined;
        query?: string | undefined;
    }): any[];
    /**
     * Returns a complete DAG dependency graph of all tasks
     * Includes upstream dependencies, downstream blocked tasks, and topological health
     */
    getTaskGraph(): {
        nodes: {
            id: any;
            title: any;
            status: any;
            priority: any;
            assignee: any;
            dependencies: any;
            unsatisfiedDependencies: any;
            isBlocked: boolean;
            downstreamDependentIds: any[];
        }[];
        edges: {
            from: any;
            to: any;
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
     * @returns {import('../result').UnitResult<Object, string>}
     */
    claimTask(taskId: string, agentId: string, leaseDurationMs?: number): import("../result").UnitResult<any, string>;
    /**
     * Renews the heartbeat lease on an in-progress task
     * @param {string} taskId
     * @param {string} agentId
     * @param {number} [extendMs]
     * @returns {import('../result').UnitResult<Object, string>}
     */
    renewHeartbeat(taskId: string, agentId: string, extendMs?: number): import("../result").UnitResult<any, string>;
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
     * @returns {import('../result').UnitResult<Object, string>}
     */
    completeTask(taskId: string, agentId: string, summary?: string): import("../result").UnitResult<any, string>;
    /**
     * Marks a task as failed
     * @param {string} taskId
     * @param {string} agentId
     * @param {string} [reason]
     * @returns {import('../result').UnitResult<Object, string>}
     */
    failTask(taskId: string, agentId: string, reason?: string): import("../result").UnitResult<any, string>;
    /**
     * Cancels a task
     * @param {string} taskId
     * @param {string} [reason]
     * @returns {import('../result').UnitResult<Object, string>}
     */
    cancelTask(taskId: string, reason?: string): import("../result").UnitResult<any, string>;
    /**
     * Appends an artifact to the task
     * @param {string} taskId
     * @param {Object} artifact
     * @returns {import('../result').UnitResult<Object, string>}
     */
    addArtifact(taskId: string, artifact: any): import("../result").UnitResult<any, string>;
    /**
     * Appends a log entry to the task
     * @param {string} taskId
     * @param {Object} log
     */
    appendLog(taskId: string, log: any): import("../result").UnitSuccess<boolean> | import("../result").UnitFailure<"TASK_NOT_FOUND_001">;
    /**
     * Private helper to check and unblock dependent tasks
     * @param {string} completedTaskId
     */
    _resolveDependencies(completedTaskId: string): void;
}
import { AgentRoster } from "./roster";
