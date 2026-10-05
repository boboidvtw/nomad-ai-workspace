/**
 * Nomad Shared Core - Task Dispatcher & Heartbeat Lease Lock
 * Manages atomic task claims, heartbeats, dependency resolution, and state transitions.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { TASK_STATUS, TASK_PRIORITY, validateTransition, createTaskEntity } = require('./task-model');
const { AgentRoster, AGENT_STATUS } = require('./roster');

class TaskDispatcher {
  /**
   * @param {Object} [options]
   * @param {AgentRoster} [options.roster]
   * @param {number} [options.defaultLeaseDurationMs=30000]
   */
  constructor(options = {}) {
    this.roster = options.roster || new AgentRoster();
    this.defaultLeaseDurationMs = options.defaultLeaseDurationMs || 30000;
    /** @type {Map<string, Object>} */
    this.tasks = new Map();
  }

  /**
   * Creates and registers a new task
   * @param {Object} input 
   * @returns {import('../result').UnitResult<Object, string>}
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
    return ok(task);
  }

  /**
   * Retrieves a task by ID
   * @param {string} id 
   * @returns {import('../result').UnitResult<Object, string>}
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
   * @returns {Object[]}
   */
  listTasks(filter = {}) {
    let list = Array.from(this.tasks.values());

    if (filter.status) {
      list = list.filter(t => t.status === filter.status);
    }
    if (filter.assignee) {
      list = list.filter(t => t.assignee === filter.assignee);
    }
    if (filter.priority) {
      list = list.filter(t => t.priority === filter.priority);
    }
    if (filter.parentGoal) {
      list = list.filter(t => t.parentGoal === filter.parentGoal);
    }

    return list.map(t => ({ ...t }));
  }

  /**
   * Atomically claims a task for an agent with an exclusive lease
   * @param {string} taskId 
   * @param {string} agentId 
   * @param {number} [leaseDurationMs] 
   * @returns {import('../result').UnitResult<Object, string>}
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
        `Task '${taskId}' is blocked pending unresolved dependencies: [${task.dependencies.join(', ')}]`
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
          `Task '${taskId}' is already claimed by agent '${task.lease.agentId}' until ${task.lease.expiresAt}`
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

    return ok({ ...task });
  }

  /**
   * Renews the heartbeat lease on an in-progress task
   * @param {string} taskId 
   * @param {string} agentId 
   * @param {number} [extendMs] 
   * @returns {import('../result').UnitResult<Object, string>}
   */
  renewHeartbeat(taskId, agentId, extendMs = this.defaultLeaseDurationMs) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return err(ErrorCodes.TASK_NOT_FOUND_001, `Task '${taskId}' not found`);
    }

    if (!task.lease || task.lease.agentId !== agentId) {
      return err(
        ErrorCodes.TASK_ALREADY_CLAIMED_003,
        `Agent '${agentId}' does not hold the active lease on task '${taskId}'`
      );
    }

    const now = Date.now();
    const currentExpiry = new Date(task.lease.expiresAt).getTime();
    if (currentExpiry < now) {
      return err(
        ErrorCodes.TASK_HEARTBEAT_EXPIRED_006,
        `Lease for task '${taskId}' expired at ${task.lease.expiresAt}`
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
            agent.currentTaskIds = agent.currentTaskIds.filter(id => id !== task.id);
            if (agent.currentTaskIds.length < agent.maxConcurrency) {
              agent.status = AGENT_STATUS.IDLE;
            }
          }

          reclaimed.push(task.id);
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
   * @returns {import('../result').UnitResult<Object, string>}
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
      agent.currentTaskIds = agent.currentTaskIds.filter(id => id !== taskId);
      if (agent.currentTaskIds.length < agent.maxConcurrency) {
        agent.status = AGENT_STATUS.IDLE;
      }
    }

    // Wake up dependent tasks
    this._resolveDependencies(taskId);

    return ok({ ...task });
  }

  /**
   * Marks a task as failed
   * @param {string} taskId 
   * @param {string} agentId 
   * @param {string} [reason] 
   * @returns {import('../result').UnitResult<Object, string>}
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
      agent.currentTaskIds = agent.currentTaskIds.filter(id => id !== taskId);
      if (agent.currentTaskIds.length < agent.maxConcurrency) {
        agent.status = AGENT_STATUS.IDLE;
      }
    }

    return ok({ ...task });
  }

  /**
   * Cancels a task
   * @param {string} taskId 
   * @param {string} [reason] 
   * @returns {import('../result').UnitResult<Object, string>}
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
        agent.currentTaskIds = agent.currentTaskIds.filter(id => id !== taskId);
        if (agent.currentTaskIds.length < agent.maxConcurrency) {
          agent.status = AGENT_STATUS.IDLE;
        }
      }
    }

    return ok({ ...task });
  }

  /**
   * Appends an artifact to the task
   * @param {string} taskId 
   * @param {Object} artifact 
   * @returns {import('../result').UnitResult<Object, string>}
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
    return ok(art);
  }

  /**
   * Appends a log entry to the task
   * @param {string} taskId 
   * @param {Object} log 
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
      if (otherTask.status === TASK_STATUS.BLOCKED && otherTask.dependencies.includes(completedTaskId)) {
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
        }
      }
    }
  }
}

module.exports = {
  TaskDispatcher,
};
