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
    /** @type {Map<string, Object>} */
    schedules: Map<string, any>;
    timer: NodeJS.Timeout | null;
    /**
     * Emits internal lifecycle events
     */
    _notify(eventType: any, data: any): void;
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
     */
    addSchedule(config: any): import("../result").UnitFailure<"TASK_SCHEDULE_INVALID_010"> | import("../result").UnitSuccess<{
        id: any;
        name: any;
        intervalMs: number;
        cronExpr: any;
        taskTemplate: {
            title: any;
            description: any;
            priority: any;
            assignee: any;
            requireApproval: boolean;
            metadata: any;
        };
        enabled: boolean;
        autoRun: boolean;
        runCount: number;
        createdAt: string;
        lastRunAt: null;
        nextRunAt: string;
    }>;
    /**
     * Lists all schedules
     */
    listSchedules(): any[];
    /**
     * Gets a specific schedule
     */
    getSchedule(id: any): any;
    /**
     * Removes a schedule
     */
    removeSchedule(id: any): import("../result").UnitSuccess<boolean> | import("../result").UnitFailure<"TASK_SCHEDULE_NOT_FOUND_011">;
    /**
     * Toggles a schedule enabled state
     */
    toggleSchedule(id: any, enabled: any): import("../result").UnitSuccess<any> | import("../result").UnitFailure<"TASK_SCHEDULE_NOT_FOUND_011">;
    /**
     * Triggers a schedule immediately
     */
    triggerSchedule(id: any): Promise<import("../result").UnitFailure<string> | import("../result").UnitSuccess<{
        schedule: any;
        task: any;
        execution: any;
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
export const DEFAULT_PRESET_SCHEDULES: {
    id: string;
    name: string;
    intervalMs: number;
    taskTemplate: {
        title: string;
        description: string;
        priority: string;
        assignee: string;
        requireApproval: boolean;
    };
    enabled: boolean;
    autoRun: boolean;
    runCount: number;
    createdAt: string;
    nextRunAt: string;
}[];
export const DEFAULT_SCHEDULES_PATH: string;
