/**
 * Nomad Shared Core - Recurring & Scheduled Tasks Engine (Paperclip Native Integration)
 * Governed by AGENTS.md Section 6: Atomic Contract & Isolate Coding Protocol
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

const DEFAULT_SCHEDULES_PATH = path.join(os.homedir(), '.nomad', 'recurring-tasks.json');

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
const DEFAULT_PRESET_SCHEDULES = [
  {
    id: 'schedule-sys-health',
    name: '服務定時健康巡檢',
    intervalMs: 300000, // 5 min
    taskTemplate: {
      title: 'Nomad 系統服務健康度常態巡檢',
      description: '定時檢查 Docker、LM Studio、Bridge 及周邊 Microservices 端口與可用性',
      priority: 'low',
      assignee: 'agent-local',
      requireApproval: false,
    },
    enabled: true,
    autoRun: true,
    runCount: 0,
    createdAt: new Date().toISOString(),
    nextRunAt: new Date(Date.now() + 300000).toISOString(),
  },
  {
    id: 'schedule-drive-sync',
    name: '工作區定時雲端同步備份',
    intervalMs: 1800000, // 30 min
    taskTemplate: {
      title: 'Universal Drive 工作區自動備份',
      description: '導出最新會話工作區並同步備份至雲端硬碟資料夾',
      priority: 'medium',
      assignee: 'agent-claude',
      requireApproval: false,
    },
    enabled: false,
    autoRun: true,
    runCount: 0,
    createdAt: new Date().toISOString(),
    nextRunAt: new Date(Date.now() + 1800000).toISOString(),
  },
];

class RecurringScheduler {
  /**
   * @param {Object} [options]
   * @param {import("./dispatcher").TaskDispatcher} [options.dispatcher] - Required for triggering schedules
   * @param {import("./task-runner").TaskRunner} [options.taskRunner]
   * @param {string} [options.storagePath]
   * @param {boolean} [options.autoPersist]
   * @param {Function} [options.onScheduleEvent]
   * @param {number} [options.pollIntervalMs]
   */
  constructor(options = {}) {
    this.dispatcher = options.dispatcher;
    this.taskRunner = options.taskRunner || null;
    this.storagePath = options.storagePath || DEFAULT_SCHEDULES_PATH;
    this.autoPersist = options.autoPersist !== false;
    this.onScheduleEvent =
      typeof options.onScheduleEvent === 'function' ? options.onScheduleEvent : null;
    this.pollIntervalMs = options.pollIntervalMs || 5000;

    /** @type {Map<string, Schedule>} */
    this.schedules = new Map();
    this.timer = null;
  }

  /**
   * Emits internal lifecycle events
   * @param {string} eventType
   * @param {unknown} data
   */
  _notify(eventType, data) {
    if (this.onScheduleEvent) {
      try {
        this.onScheduleEvent(eventType, data);
      } catch (e) {
        console.warn(
          '[RecurringScheduler] onScheduleEvent callback failed:',
          e instanceof Error ? e.message : String(e),
        );
      }
    }
  }

  /**
   * Persists all recurring schedules to disk atomically
   */
  async saveToDisk(customPath = this.storagePath) {
    if (!customPath) {
      return ok({ persisted: false, count: 0 });
    }
    try {
      const dir = path.dirname(customPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = JSON.stringify(Array.from(this.schedules.values()), null, 2);
      const tmpPath = `${customPath}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`;
      fs.writeFileSync(tmpPath, data, 'utf8');
      fs.renameSync(tmpPath, customPath);
      return ok({ persisted: true, path: customPath, count: this.schedules.size });
    } catch (e) {
      return err(
        ErrorCodes.TASK_STORAGE_SAVE_FAILED_008,
        `Failed to save recurring schedules: ${e instanceof Error ? e.message : String(e)}`,
        { error: e },
      );
    }
  }

  /**
   * Loads recurring schedules from disk
   */
  loadFromDisk(customPath = this.storagePath) {
    if (!customPath || !fs.existsSync(customPath)) {
      // Seed default preset schedules
      this.schedules.clear();
      for (const s of DEFAULT_PRESET_SCHEDULES) {
        this.schedules.set(s.id, { ...s });
      }
      return ok({
        loaded: true,
        path: customPath,
        count: this.schedules.size,
        seededDefaults: true,
      });
    }
    try {
      const raw = fs.readFileSync(customPath, 'utf8');
      if (!raw.trim()) {
        return ok({ loaded: true, count: 0 });
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return err(
          ErrorCodes.TASK_STORAGE_LOAD_FAILED_009,
          'Stored recurring schedules invalid: expected an array',
        );
      }

      this.schedules.clear();
      for (const s of parsed) {
        if (s && s.id) {
          this.schedules.set(s.id, s);
        }
      }

      return ok({ loaded: true, path: customPath, count: this.schedules.size });
    } catch (e) {
      return err(
        ErrorCodes.TASK_STORAGE_LOAD_FAILED_009,
        `Failed to load recurring schedules: ${e instanceof Error ? e.message : String(e)}`,
        { error: e },
      );
    }
  }

  /**
   * Registers a new recurring schedule
   * @param {{ id?: string, name: string, intervalMs?: number, cronExpr?: string | null, taskTemplate: ScheduleTaskTemplate, enabled?: boolean, autoRun?: boolean }} config
   * @returns {import('../result').UnitResult<Schedule>}
   */
  addSchedule(config) {
    if (!config || !config.name || !config.taskTemplate || !config.taskTemplate.title) {
      return err(
        ErrorCodes.TASK_SCHEDULE_INVALID_010,
        'Schedule name and taskTemplate.title are required',
      );
    }

    const intervalMs = Number(config.intervalMs) || 300000;
    if (intervalMs < 1000) {
      return err(
        ErrorCodes.TASK_SCHEDULE_INVALID_010,
        'Schedule intervalMs must be at least 1000ms',
      );
    }

    const id = config.id || `schedule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = Date.now();

    /** @type {Schedule} */
    const schedule = {
      id,
      name: config.name.trim(),
      intervalMs,
      cronExpr: config.cronExpr || null,
      taskTemplate: {
        title: config.taskTemplate.title.trim(),
        description: config.taskTemplate.description || '',
        priority: config.taskTemplate.priority || 'medium',
        assignee: config.taskTemplate.assignee || 'agent-claude',
        requireApproval: config.taskTemplate.requireApproval !== false,
        metadata: config.taskTemplate.metadata || {},
      },
      enabled: config.enabled !== false,
      autoRun: config.autoRun !== false,
      runCount: 0,
      createdAt: new Date(now).toISOString(),
      lastRunAt: null,
      nextRunAt: new Date(now + intervalMs).toISOString(),
    };

    this.schedules.set(id, schedule);
    if (this.autoPersist) {
      this.saveToDisk();
    }
    this._notify('schedule:added', schedule);
    return ok(schedule);
  }

  /**
   * Lists all schedules
   */
  listSchedules() {
    return Array.from(this.schedules.values()).map((s) => ({ ...s }));
  }

  /**
   * Gets a specific schedule
   * @param {string} id
   */
  getSchedule(id) {
    return this.schedules.get(id) || null;
  }

  /**
   * Removes a schedule
   * @param {string} id
   */
  removeSchedule(id) {
    if (!this.schedules.has(id)) {
      return err(ErrorCodes.TASK_SCHEDULE_NOT_FOUND_011, `Schedule "${id}" not found`);
    }
    const removed = this.schedules.get(id);
    this.schedules.delete(id);
    if (this.autoPersist) {
      this.saveToDisk();
    }
    this._notify('schedule:removed', removed);
    return ok(true);
  }

  /**
   * Toggles a schedule enabled state
   * @param {string} id
   * @param {boolean} [enabled] - Omit to flip the current state
   */
  toggleSchedule(id, enabled) {
    const schedule = this.schedules.get(id);
    if (!schedule) {
      return err(ErrorCodes.TASK_SCHEDULE_NOT_FOUND_011, `Schedule "${id}" not found`);
    }

    schedule.enabled = typeof enabled === 'boolean' ? enabled : !schedule.enabled;
    if (schedule.enabled) {
      schedule.nextRunAt = new Date(Date.now() + schedule.intervalMs).toISOString();
    }
    if (this.autoPersist) {
      this.saveToDisk();
    }
    this._notify('schedule:updated', schedule);
    return ok(schedule);
  }

  /**
   * Triggers a schedule immediately
   * @param {string} id
   */
  async triggerSchedule(id) {
    const schedule = this.schedules.get(id);
    if (!schedule) {
      return err(ErrorCodes.TASK_SCHEDULE_NOT_FOUND_011, `Schedule "${id}" not found`);
    }

    if (!this.dispatcher) {
      return err(
        ErrorCodes.TASK_EXECUTION_FAILED_007,
        'TaskDispatcher is not attached to scheduler',
      );
    }

    const taskResult = this.dispatcher.createTask({
      ...schedule.taskTemplate,
      metadata: {
        ...schedule.taskTemplate.metadata,
        triggeredByScheduleId: schedule.id,
        scheduledName: schedule.name,
      },
    });

    if (!taskResult.success) {
      return taskResult;
    }

    const createdTask = taskResult.data;
    schedule.lastRunAt = new Date().toISOString();
    schedule.runCount = (schedule.runCount || 0) + 1;
    schedule.nextRunAt = new Date(Date.now() + schedule.intervalMs).toISOString();

    if (this.autoPersist) {
      this.saveToDisk();
    }

    let runExecution = null;
    if (schedule.autoRun && this.taskRunner) {
      try {
        const runRes = await this.taskRunner.dispatchAndRun(
          createdTask.id,
          schedule.taskTemplate.assignee || 'agent-claude',
        );
        if (runRes.success) {
          runExecution = runRes.data;
        }
      } catch (e) {
        console.warn(
          `[RecurringScheduler] Auto-run failed for task "${createdTask.id}":`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }

    this._notify('schedule:triggered', {
      schedule,
      task: createdTask,
      execution: runExecution,
    });

    return ok({
      schedule,
      task: createdTask,
      execution: runExecution,
    });
  }

  /**
   * Starts scheduler polling loop
   */
  start() {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      const now = Date.now();
      for (const schedule of this.schedules.values()) {
        if (!schedule.enabled) continue;
        const nextTime = schedule.nextRunAt ? new Date(schedule.nextRunAt).getTime() : 0;
        if (now >= nextTime) {
          try {
            await this.triggerSchedule(schedule.id);
          } catch (e) {
            console.warn(
              `[RecurringScheduler] Trigger error for schedule "${schedule.id}":`,
              e instanceof Error ? e.message : String(e),
            );
          }
        }
      }
    }, this.pollIntervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  /**
   * Stops scheduler polling loop
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

module.exports = {
  RecurringScheduler,
  DEFAULT_PRESET_SCHEDULES,
  DEFAULT_SCHEDULES_PATH,
};
