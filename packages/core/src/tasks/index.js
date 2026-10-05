/**
 * Nomad Shared Core - Task Control Plane (Paperclip Native Integration)
 */

const { TASK_STATUS, TASK_PRIORITY, validateTransition, createTaskEntity } = require('./task-model');
const { AGENT_STATUS, DEFAULT_ROSTER, AgentRoster } = require('./roster');
const { TaskDispatcher } = require('./dispatcher');
const { ApprovalGate } = require('./approval-gate');
const { TaskRunner } = require('./task-runner');

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
};
