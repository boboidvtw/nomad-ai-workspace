export type ScheduleTaskTemplate = {
    title: string;
    description?: string | undefined;
    priority?: string | undefined;
    assignee?: string | undefined;
    requireApproval?: boolean | undefined;
    metadata?: Record<string, unknown> | undefined;
};
export type Schedule = {
    id: string;
    name: string;
    intervalMs: number;
    cronExpr?: string | null | undefined;
    taskTemplate: ScheduleTaskTemplate;
    enabled: boolean;
    autoRun: boolean;
    runCount: number;
    createdAt: string;
    lastRunAt?: string | null | undefined;
    nextRunAt: string;
};
export class RecurringScheduler {
    /**
     * @param {Object} [options]
     * @param {import("./dispatcher").TaskDispatcher} [options.dispatcher] - Required for triggering schedules
     * @param {import("./task-runner").TaskRunner} [options.taskRunner]
     * @param {string} [options.storagePath]
     * @param {boolean} [options.autoPersist]
     * @param {Function} [options.onScheduleEvent]
     * @param {number} [options.pollIntervalMs]
     */
    constructor(options?: {
        dispatcher?: import("./dispatcher").TaskDispatcher | undefined;
        taskRunner?: import("./task-runner").TaskRunner | undefined;
        storagePath?: string | undefined;
        autoPersist?: boolean | undefined;
        onScheduleEvent?: Function | undefined;
        pollIntervalMs?: number | undefined;
    });
    dispatcher: import("./dispatcher").TaskDispatcher | undefined;
    taskRunner: import("./task-runner").TaskRunner | null;
    storagePath: string;
    autoPersist: boolean;
    onScheduleEvent: Function | null;
    pollIntervalMs: number;
    /** @type {Map<string, Schedule>} */
    schedules: Map<string, Schedule>;
    timer: NodeJS.Timeout | null;
    /**
     * Emits internal lifecycle events
     * @param {string} eventType
     * @param {unknown} data
     */
    _notify(eventType: string, data: unknown): void;
    /**
     * Persists all recurring schedules to disk atomically
     */
    saveToDisk(customPath?: string): Promise<import("../result").UnitFailure<"TASK_STORAGE_SAVE_FAILED_008"> | import("../result").UnitSuccess<{
        persisted: boolean;
        count: number;
    }>>;
    /**
     * Loads recurring schedules from disk
     */
    loadFromDisk(customPath?: string): import("../result").UnitFailure<"TASK_STORAGE_LOAD_FAILED_009"> | import("../result").UnitSuccess<{
        loaded: boolean;
        count: number;
    }>;
    /**
     * Registers a new recurring schedule
     * @param {{ id?: string, name: string, intervalMs?: number, cronExpr?: string | null, taskTemplate: ScheduleTaskTemplate, enabled?: boolean, autoRun?: boolean }} config
     * @returns {import('../result').UnitResult<Schedule>}
     */
    addSchedule(config: {
        id?: string;
        name: string;
        intervalMs?: number;
        cronExpr?: string | null;
        taskTemplate: ScheduleTaskTemplate;
        enabled?: boolean;
        autoRun?: boolean;
    }): import("../result").UnitResult<Schedule>;
    /**
     * Lists all schedules
     */
    listSchedules(): {
        id: string;
        name: string;
        intervalMs: number;
        cronExpr?: string | null | undefined;
        taskTemplate: ScheduleTaskTemplate;
        enabled: boolean;
        autoRun: boolean;
        runCount: number;
        createdAt: string;
        lastRunAt?: string | null | undefined;
        nextRunAt: string;
    }[];
    /**
     * Gets a specific schedule
     * @param {string} id
     */
    getSchedule(id: string): Schedule | null;
    /**
     * Removes a schedule
     * @param {string} id
     */
    removeSchedule(id: string): import("../result").UnitSuccess<boolean> | import("../result").UnitFailure<"TASK_SCHEDULE_NOT_FOUND_011">;
    /**
     * Toggles a schedule enabled state
     * @param {string} id
     * @param {boolean} [enabled] - Omit to flip the current state
     */
    toggleSchedule(id: string, enabled?: boolean): import("../result").UnitSuccess<Schedule> | import("../result").UnitFailure<"TASK_SCHEDULE_NOT_FOUND_011">;
    /**
     * Triggers a schedule immediately
     * @param {string} id
     */
    triggerSchedule(id: string): Promise<import("../result").UnitFailure<string> | import("../result").UnitSuccess<{
        schedule: Schedule;
        task: import("./task-model").Task;
        execution: import("./task-model").Task | null | undefined;
    }>>;
    /**
     * Starts scheduler polling loop
     */
    start(): void;
    /**
     * Stops scheduler polling loop
     */
    stop(): void;
}
/**
 * Default preset recurring jobs
 */
/**
 * @typedef {Object} ScheduleTaskTemplate
 * @property {string} title
 * @property {string} [description]
 * @property {string} [priority]
 * @property {string} [assignee]
 * @property {boolean} [requireApproval]
 * @property {Record<string, unknown>} [metadata]
 */
/**
 * @typedef {Object} Schedule
 * @property {string} id
 * @property {string} name
 * @property {number} intervalMs
 * @property {string | null} [cronExpr]
 * @property {ScheduleTaskTemplate} taskTemplate
 * @property {boolean} enabled
 * @property {boolean} autoRun
 * @property {number} runCount
 * @property {string} createdAt
 * @property {string | null} [lastRunAt]
 * @property {string} nextRunAt
 */
/** @type {Schedule[]} */
export const DEFAULT_PRESET_SCHEDULES: Schedule[];
export const DEFAULT_SCHEDULES_PATH: string;
