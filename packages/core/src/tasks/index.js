/**
 * Nomad Shared Core - Task Control Plane (Paperclip Native Integration)
 */

const {
  TASK_STATUS,
  TASK_PRIORITY,
  validateTransition,
  createTaskEntity,
} = require('./task-model');
const { AGENT_STATUS, DEFAULT_ROSTER, AgentRoster } = require('./roster');
const { TaskDispatcher } = require('./dispatcher');
const { ApprovalGate } = require('./approval-gate');
const { TaskRunner } = require('./task-runner');
const {
  RecurringScheduler,
  DEFAULT_PRESET_SCHEDULES,
  DEFAULT_SCHEDULES_PATH,
  routineLabel,
  WEBVIEW_PLATFORMS,
} = require('./recurring-scheduler');
const { DEFAULT_MAX_CONCURRENT_WORKTREES, WorktreeManager } = require('./worktree-manager');
const { CONTRACT_LOCKED_REGEX, P2PBus } = require('./p2p-bus');
const { SharedContextPool } = require('./shared-context-pool');
const { handleAgenshRequest } = require('./agensh-routes');

module.exports = {
  TASK_STATUS,
  TASK_PRIORITY,
  validateTransition,
  createTaskEntity,
  AGENT_STATUS,
  DEFAULT_ROSTER,
  AgentRoster,
  TaskDispatcher,
  ApprovalGate,
  TaskRunner,
  RecurringScheduler,
  DEFAULT_PRESET_SCHEDULES,
  DEFAULT_SCHEDULES_PATH,
  routineLabel,
  WEBVIEW_PLATFORMS,
  DEFAULT_MAX_CONCURRENT_WORKTREES,
  WorktreeManager,
  CONTRACT_LOCKED_REGEX,
  P2PBus,
  SharedContextPool,
  handleAgenshRequest,
};
