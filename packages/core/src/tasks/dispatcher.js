/**
 * Nomad Shared Core - Task Dispatcher & Heartbeat Lease Lock
 * Manages atomic task claims, heartbeats, dependency resolution, disk persistence, and event notifications.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const {
  TASK_STATUS,
  TASK_PRIORITY,
  validateTransition,
  createTaskEntity,
} = require('./task-model');
const { AgentRoster, AGENT_STATUS } = require('./roster');

class TaskDispatcher {
  /**
   * @param {Object} [options]
   * @param {AgentRoster} [options.roster]
   * @param {number} [options.defaultLeaseDurationMs=30000]
   * @param {string} [options.storagePath]
   * @param {boolean} [options.autoPersist=false]
   * @param {Function} [options.onTaskEvent] - (eventType, task) => void
   */
  constructor(options = {}) {
    this.roster = options.roster || new AgentRoster();
    this.defaultLeaseDurationMs = options.defaultLeaseDurationMs || 30000;
    this.storagePath = options.storagePath || path.join(os.homedir(), '.nomad', 'tasks.json');
    this.autoPersist =
      options.autoPersist !== undefined
        ? Boolean(options.autoPersist)
        : Boolean(options.storagePath);
    this.onTaskEvent = typeof options.onTaskEvent === 'function' ? options.onTaskEvent : null;
    /** @type {Map<string, import('./task-model').Task>} */
    this.tasks = new Map();
  }

  /**
   * Emits a task event and persists state if autoPersist is true
   * @param {string} eventType
   * @param {import('./task-model').Task} task
   */
  _notify(eventType, task) {
    if (this.onTaskEvent) {
      try {
        this.onTaskEvent(eventType, { ...task });
      } catch (e) {
        console.warn(`[TaskDispatcher] onTaskEvent error on ${eventType}:`, e);
      }
    }
    if (this.autoPersist && this.storagePath) {
      this.saveToDisk().catch(() => {});
    }
  }

  /**
   * Persists all tasks to disk atomically
   * @param {string} [customPath]
   * @returns {Promise<import('../result').UnitResult<{ persisted: boolean, path?: string, count: number }>>}
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
      const data = JSON.stringify(Array.from(this.tasks.values()), null, 2);
      const tmpPath = `${customPath}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`;
      fs.writeFileSync(tmpPath, data, 'utf8');
      fs.renameSync(tmpPath, customPath);
      return ok({ persisted: true, path: customPath, count: this.tasks.size });
    } catch (e) {
      return err(
        ErrorCodes.TASK_STORAGE_SAVE_FAILED_008,
        `Failed to save tasks to disk: ${e instanceof Error ? e.message : String(e)}`,
        { error: e },
      );
    }
  }

  /**
   * Loads tasks from disk and restores state, automatically resolving offline lease expiries
   * @param {string} [customPath]
   * @returns {import('../result').UnitResult<{ loaded: boolean, path?: string, count: number, reason?: string }>}
   */
  loadFromDisk(customPath = this.storagePath) {
    if (!customPath || !fs.existsSync(customPath)) {
      return ok({ loaded: false, count: 0, reason: 'File does not exist' });
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
          'Stored tasks format invalid: expected an array',
        );
      }

      this.tasks.clear();
      for (const t of parsed) {
        if (t && t.id) {
          this.tasks.set(t.id, t);
        }
      }

      // Reconcile any leases that expired while offline
      const reclaimed = this.checkExpiredLeases();

      return ok({
        loaded: true,
        path: customPath,
        count: this.tasks.size,
        reclaimedCount: reclaimed.length,
      });
    } catch (e) {
      return err(
        ErrorCodes.TASK_STORAGE_LOAD_FAILED_009,
        `Failed to load tasks from disk: ${e instanceof Error ? e.message : String(e)}`,
        { error: e },
      );
    }
  }

  /**
   * Creates and registers a new task
   * @param {Parameters<typeof createTaskEntity>[0]} input
   * @returns {import('../result').UnitResult<import('./task-model').Task>}
   */
  createTask(input) {
    const entityResult = createTaskEntity(input);
    if (!entityResult.success) {
      return entityResult;
    }
    const task = entityResult.data;

    // Evaluate dependencies if specified
    if (task.dependencies.length > 0) {
      let allResolved = true;
      for (const depId of task.dependencies) {
        const dep = this.tasks.get(depId);
        if (!dep || dep.status !== TASK_STATUS.COMPLETED) {
          allResolved = false;
          break;
        }
      }
      task.status = allResolved ? TASK_STATUS.TODO : TASK_STATUS.BLOCKED;
    }

    this.tasks.set(task.id, task);
    this._notify('task:created', task);
    return ok(task);
  }

  /**
   * Retrieves a task by ID
   * @param {string} id
   * @returns {import('../result').UnitResult<import('./task-model').Task>}
   */
  getTask(id) {
    const task = this.tasks.get(id);
    if (!task) {
      return err(ErrorCodes.TASK_NOT_FOUND_001, `Task '${id}' not found`);
    }
    return ok({ ...task });
  }

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
  listTasks(filter = {}) {
    let list = Array.from(this.tasks.values());

    if (filter.status) {
      list = list.filter((t) => t.status === filter.status);
    }
    if (filter.assignee) {
      list = list.filter((t) => t.assignee === filter.assignee);
    }
    if (filter.priority) {
      list = list.filter((t) => t.priority === filter.priority);
    }
    if (filter.parentGoal) {
      list = list.filter((t) => t.parentGoal === filter.parentGoal);
    }
    if (filter.query && typeof filter.query === 'string') {
      const q = filter.query.toLowerCase().trim();
      if (q) {
        list = list.filter((t) => {
          const matchTitle = t.title && t.title.toLowerCase().includes(q);
          const matchDesc = t.description && t.description.toLowerCase().includes(q);
          const matchId = t.id && t.id.toLowerCase().includes(q);
          const matchAssignee = t.assignee && t.assignee.toLowerCase().includes(q);
          const matchLogs =
            Array.isArray(t.logs) &&
            t.logs.some((l) => l.message && l.message.toLowerCase().includes(q));
          return matchTitle || matchDesc || matchId || matchAssignee || matchLogs;
        });
      }
    }

    return list.map((t) => ({ ...t }));
  }

  /**
   * Returns a complete DAG dependency graph of all tasks
   * Includes upstream dependencies, downstream blocked tasks, and topological health
   */
  getTaskGraph() {
    const allTasks = Array.from(this.tasks.values());
    const nodes = [];
    const edges = [];
    const taskMap = new Map();
    for (const t of allTasks) {
      taskMap.set(t.id, t);
    }

    for (const t of allTasks) {
      const upstream = Array.isArray(t.dependencies) ? t.dependencies : [];
      const unsatisfiedDependencies = upstream.filter((depId) => {
        const dep = taskMap.get(depId);
        return !dep || dep.status !== 'completed';
      });

      const downstream = allTasks
        .filter((other) => Array.isArray(other.dependencies) && other.dependencies.includes(t.id))
        .map((other) => other.id);

      nodes.push({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        assignee: t.assignee,
        dependencies: upstream,
        unsatisfiedDependencies,
        isBlocked: unsatisfiedDependencies.length > 0,
        downstreamDependentIds: downstream,
      });

      for (const depId of upstream) {
        edges.push({
          from: depId,
          to: t.id,
          satisfied: taskMap.has(depId) && taskMap.get(depId).status === 'completed',
        });
      }
    }

    return {
      nodes,
      edges,
      totalCount: nodes.length,
      blockedCount: nodes.filter((n) => n.isBlocked).length,
    };
  }

  /**
   * Atomically claims a task for an agent with an exclusive lease
   * @param {string} taskId
   * @param {string} agentId
   * @param {number} [leaseDurationMs]
   * @returns {import('../result').UnitResult<import('./task-model').Task>}
   */
  claimTask(taskId, agentId, leaseDurationMs = this.defaultLeaseDurationMs) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return err(ErrorCodes.TASK_NOT_FOUND_001, `Task '${taskId}' not found`);
    }

    // Verify agent exists in roster
    const agentRes = this.roster.getAgent(agentId);
    if (!agentRes.success) {
      return agentRes;
    }
    const agent = agentRes.data;

    // Check if task is blocked
    if (task.status === TASK_STATUS.BLOCKED) {
      return err(
        ErrorCodes.TASK_DEPENDENCY_UNRESOLVED_005,
        `Task '${taskId}' is blocked pending unresolved dependencies: [${task.dependencies.join(', ')}]`,
      );
    }

    const now = Date.now();
    const isoNow = new Date(now).toISOString();

    // Check active lease
    if (task.lease) {
      const leaseExpires = new Date(task.lease.expiresAt).getTime();
      if (leaseExpires > now && task.lease.agentId !== agentId) {
        return err(
          ErrorCodes.TASK_ALREADY_CLAIMED_003,
          `Task '${taskId}' is already claimed by agent '${task.lease.agentId}' until ${task.lease.expiresAt}`,
        );
      }
    }

    // Validate state transition
    const transRes = validateTransition(task.status, TASK_STATUS.IN_PROGRESS);
    if (!transRes.success) {
      return transRes;
    }

    const expiresAt = new Date(now + leaseDurationMs).toISOString();
    task.status = TASK_STATUS.IN_PROGRESS;
    task.assignee = agentId;
    task.lease = {
      agentId,
      acquiredAt: isoNow,
      expiresAt,
    };
    task.updatedAt = isoNow;
    task.logs.push({
      timestamp: isoNow,
      level: 'info',
      message: `Task claimed by ${agent.name} (${agentId}) with lease expiring at ${expiresAt}`,
    });

    // Update roster state
    const rosterAgent = this.roster.agents.get(agentId);
    if (rosterAgent) {
      if (!rosterAgent.currentTaskIds.includes(taskId)) {
        rosterAgent.currentTaskIds.push(taskId);
      }
      if (rosterAgent.currentTaskIds.length >= rosterAgent.maxConcurrency) {
        rosterAgent.status = AGENT_STATUS.BUSY;
      }
    }

    this._notify('task:claimed', task);
    return ok({ ...task });
  }

  /**
   * Renews the heartbeat lease on an in-progress task
   * @param {string} taskId
   * @param {string} agentId
   * @param {number} [extendMs]
   * @returns {import('../result').UnitResult<import('./task-model').TaskLease>}
   */
  renewHeartbeat(taskId, agentId, extendMs = this.defaultLeaseDurationMs) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return err(ErrorCodes.TASK_NOT_FOUND_001, `Task '${taskId}' not found`);
    }

    if (!task.lease || task.lease.agentId !== agentId) {
      return err(
        ErrorCodes.TASK_ALREADY_CLAIMED_003,
        `Agent '${agentId}' does not hold the active lease on task '${taskId}'`,
      );
    }

    const now = Date.now();
    const currentExpiry = new Date(task.lease.expiresAt).getTime();
    if (currentExpiry < now) {
      return err(
        ErrorCodes.TASK_HEARTBEAT_EXPIRED_006,
        `Lease for task '${taskId}' expired at ${task.lease.expiresAt}`,
      );
    }

    const newExpiry = new Date(now + extendMs).toISOString();
    task.lease.expiresAt = newExpiry;
    task.updatedAt = new Date(now).toISOString();
    task.logs.push({
      timestamp: task.updatedAt,
      level: 'debug',
      message: `Heartbeat renewed by ${agentId}. New expiry: ${newExpiry}`,
    });

    this._notify('task:heartbeat', task);
    return ok({ ...task.lease });
  }

  /**
   * Sweeps and reclaims tasks with expired heartbeat leases
   * @returns {string[]} List of reclaimed task IDs
   */
  checkExpiredLeases() {
    const now = Date.now();
    const reclaimed = [];

    for (const task of this.tasks.values()) {
      if (task.status === TASK_STATUS.IN_PROGRESS && task.lease) {
        const expiry = new Date(task.lease.expiresAt).getTime();
        if (expiry <= now) {
          const expiredAgentId = task.lease.agentId;
          task.status = TASK_STATUS.TODO;
          task.lease = null;
          task.updatedAt = new Date(now).toISOString();
          task.logs.push({
            timestamp: task.updatedAt,
            level: 'warn',
            message: `Heartbeat lease expired for agent ${expiredAgentId}. Task returned to 'todo' pool.`,
          });

          // Free up agent slot
          const agent = this.roster.agents.get(expiredAgentId);
          if (agent) {
            agent.currentTaskIds = agent.currentTaskIds.filter((id) => id !== task.id);
            if (agent.currentTaskIds.length < agent.maxConcurrency) {
              agent.status = AGENT_STATUS.IDLE;
            }
          }

          reclaimed.push(task.id);
          this._notify('task:reclaimed', task);
        }
      }
    }

    return reclaimed;
  }

  /**
   * Marks a task as completed and automatically wakes up dependent tasks
   * @param {string} taskId
   * @param {string} agentId
   * @param {string} [summary]
   * @returns {import('../result').UnitResult<import('./task-model').Task>}
   */
  completeTask(taskId, agentId, summary = '') {
    const task = this.tasks.get(taskId);
    if (!task) {
      return err(ErrorCodes.TASK_NOT_FOUND_001, `Task '${taskId}' not found`);
    }

    const transRes = validateTransition(task.status, TASK_STATUS.COMPLETED);
    if (!transRes.success) {
      return transRes;
    }

    const now = new Date().toISOString();
    task.status = TASK_STATUS.COMPLETED;
    task.lease = null;
    task.updatedAt = now;
    task.logs.push({
      timestamp: now,
      level: 'info',
      message: `Task completed by ${agentId}. Summary: ${summary || 'None'}`,
    });

    // Release agent in roster
    const agent = this.roster.agents.get(agentId);
    if (agent) {
      agent.currentTaskIds = agent.currentTaskIds.filter((id) => id !== taskId);
      if (agent.currentTaskIds.length < agent.maxConcurrency) {
        agent.status = AGENT_STATUS.IDLE;
      }
    }

    // Wake up dependent tasks
    this._resolveDependencies(taskId);

    this._notify('task:completed', task);
    return ok({ ...task });
  }

  /**
   * Marks a task as failed
   * @param {string} taskId
   * @param {string} agentId
   * @param {string} [reason]
   * @returns {import('../result').UnitResult<import('./task-model').Task>}
   */
  failTask(taskId, agentId, reason = '') {
    const task = this.tasks.get(taskId);
    if (!task) {
      return err(ErrorCodes.TASK_NOT_FOUND_001, `Task '${taskId}' not found`);
    }

    const transRes = validateTransition(task.status, TASK_STATUS.FAILED);
    if (!transRes.success) {
      return transRes;
    }

    const now = new Date().toISOString();
    task.status = TASK_STATUS.FAILED;
    task.lease = null;
    task.updatedAt = now;
    task.logs.push({
      timestamp: now,
      level: 'error',
      message: `Task failed by ${agentId}. Reason: ${reason || 'Unknown'}`,
    });

    const agent = this.roster.agents.get(agentId);
    if (agent) {
      agent.currentTaskIds = agent.currentTaskIds.filter((id) => id !== taskId);
      if (agent.currentTaskIds.length < agent.maxConcurrency) {
        agent.status = AGENT_STATUS.IDLE;
      }
    }

    this._notify('task:failed', task);
    return ok({ ...task });
  }

  /**
   * Cancels a task
   * @param {string} taskId
   * @param {string} [reason]
   * @returns {import('../result').UnitResult<import('./task-model').Task>}
   */
  cancelTask(taskId, reason = '') {
    const task = this.tasks.get(taskId);
    if (!task) {
      return err(ErrorCodes.TASK_NOT_FOUND_001, `Task '${taskId}' not found`);
    }

    const transRes = validateTransition(task.status, TASK_STATUS.CANCELLED);
    if (!transRes.success) {
      return transRes;
    }

    const now = new Date().toISOString();
    task.status = TASK_STATUS.CANCELLED;
    const oldAssignee = task.lease ? task.lease.agentId : task.assignee;
    task.lease = null;
    task.updatedAt = now;
    task.logs.push({
      timestamp: now,
      level: 'warn',
      message: `Task cancelled. Reason: ${reason || 'User cancelled'}`,
    });

    if (oldAssignee) {
      const agent = this.roster.agents.get(oldAssignee);
      if (agent) {
        agent.currentTaskIds = agent.currentTaskIds.filter((id) => id !== taskId);
        if (agent.currentTaskIds.length < agent.maxConcurrency) {
          agent.status = AGENT_STATUS.IDLE;
        }
      }
    }

    this._notify('task:cancelled', task);
    return ok({ ...task });
  }

  /**
   * Appends an artifact to the task
   * @param {string} taskId
   * @param {{ name?: string, type?: string, content?: string, uri?: string | null }} artifact
   * @returns {import('../result').UnitResult<import('./task-model').TaskArtifact>}
   */
  addArtifact(taskId, artifact) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return err(ErrorCodes.TASK_NOT_FOUND_001, `Task '${taskId}' not found`);
    }
    const id = `art_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const art = {
      id,
      name: artifact.name || 'Untitled Artifact',
      type: artifact.type || 'text/plain',
      content: artifact.content || '',
      uri: artifact.uri || null,
      createdAt: new Date().toISOString(),
    };
    task.artifacts.push(art);
    task.updatedAt = new Date().toISOString();
    this._notify('task:artifact_added', task);
    return ok(art);
  }

  /**
   * Appends a log entry to the task
   * @param {string} taskId
   * @param {{ level?: import('./task-model').TaskLog['level'], message: string }} log
   */
  appendLog(taskId, log) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return err(ErrorCodes.TASK_NOT_FOUND_001, `Task '${taskId}' not found`);
    }
    task.logs.push({
      timestamp: new Date().toISOString(),
      level: log.level || 'info',
      message: log.message || '',
    });
    return ok(true);
  }

  /**
   * Private helper to check and unblock dependent tasks
   * @param {string} completedTaskId
   */
  _resolveDependencies(completedTaskId) {
    for (const otherTask of this.tasks.values()) {
      if (
        otherTask.status === TASK_STATUS.BLOCKED &&
        otherTask.dependencies.includes(completedTaskId)
      ) {
        let allMet = true;
        for (const depId of otherTask.dependencies) {
          const dep = this.tasks.get(depId);
          if (!dep || dep.status !== TASK_STATUS.COMPLETED) {
            allMet = false;
            break;
          }
        }
        if (allMet) {
          otherTask.status = TASK_STATUS.TODO;
          otherTask.updatedAt = new Date().toISOString();
          otherTask.logs.push({
            timestamp: otherTask.updatedAt,
            level: 'info',
            message: `All dependencies resolved. Unblocked and moved to 'todo'.`,
          });
          this._notify('task:unblocked', otherTask);
        }
      }
    }
  }
}

module.exports = {
  TaskDispatcher,
};
