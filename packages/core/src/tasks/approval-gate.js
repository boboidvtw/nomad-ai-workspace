/**
 * Nomad Shared Core - Human-in-the-Loop Approval Gate
 * Manages review checkpoints, operator approvals, rejections, and feedback.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { TASK_STATUS, validateTransition } = require('./task-model');

class ApprovalGate {
  /**
   * Submits an in-progress task for operator review
   * @param {import('./dispatcher').TaskDispatcher} dispatcher 
   * @param {string} taskId 
   * @param {string} agentId 
   * @param {Object} reviewRequest 
   * @param {string} reviewRequest.proposal
   * @param {string} [reviewRequest.diff]
   * @returns {import('../result').UnitResult<Object, string>}
   */
  static submitForReview(dispatcher, taskId, agentId, reviewRequest = {}) {
    const taskRes = dispatcher.getTask(taskId);
    if (!taskRes.success) {
      return taskRes;
    }
    const task = dispatcher.tasks.get(taskId);

    if (task.status !== TASK_STATUS.IN_PROGRESS) {
      return err(
        ErrorCodes.TASK_INVALID_STATE_TRANSITION_004,
        `Task must be in '${TASK_STATUS.IN_PROGRESS}' to submit for review, current: '${task.status}'`
      );
    }

    const transRes = validateTransition(task.status, TASK_STATUS.REVIEW);
    if (!transRes.success) {
      return transRes;
    }

    const now = new Date().toISOString();
    task.status = TASK_STATUS.REVIEW;
    task.reviewGate = {
      requestedAt: now,
      requestedBy: agentId,
      proposal: reviewRequest.proposal || 'Review requested for task execution plan',
      diff: reviewRequest.diff || null,
      status: 'pending',
      reviewer: null,
      decision: null,
      feedback: null,
      decidedAt: null,
    };
    task.updatedAt = now;
    task.logs.push({
      timestamp: now,
      level: 'info',
      message: `Task submitted for human review by ${agentId}. Proposal: ${task.reviewGate.proposal}`,
    });

    return ok({ ...task });
  }

  /**
   * Records a human operator approval or rejection decision
   * @param {import('./dispatcher').TaskDispatcher} dispatcher 
   * @param {string} taskId 
   * @param {Object} decisionInput 
   * @param {'approve' | 'reject'} decisionInput.decision
   * @param {string} [decisionInput.feedback]
   * @param {string} [decisionInput.reviewer='operator']
   * @param {boolean} [decisionInput.completeOnApproval=true]
   * @returns {import('../result').UnitResult<Object, string>}
   */
  static decideApproval(dispatcher, taskId, decisionInput = {}) {
    const task = dispatcher.tasks.get(taskId);
    if (!task) {
      return err(ErrorCodes.TASK_NOT_FOUND_001, `Task '${taskId}' not found`);
    }

    if (task.status !== TASK_STATUS.REVIEW || !task.reviewGate) {
      return err(
        ErrorCodes.APPROVAL_GATE_NOT_PENDING_001,
        `Task '${taskId}' is not pending approval (status: '${task.status}')`
      );
    }

    const decision = (decisionInput.decision || '').toLowerCase();
    if (decision !== 'approve' && decision !== 'reject') {
      return err(
        ErrorCodes.APPROVAL_ACTION_INVALID_002,
        `Invalid approval decision: '${decisionInput.decision}'. Must be 'approve' or 'reject'`
      );
    }

    const now = new Date().toISOString();
    const reviewer = decisionInput.reviewer || 'operator';
    const feedback = decisionInput.feedback || '';

    task.reviewGate.status = decision === 'approve' ? 'approved' : 'rejected';
    task.reviewGate.decision = decision;
    task.reviewGate.reviewer = reviewer;
    task.reviewGate.feedback = feedback;
    task.reviewGate.decidedAt = now;
    task.updatedAt = now;

    if (decision === 'approve') {
      const complete = decisionInput.completeOnApproval !== false;
      const targetStatus = complete ? TASK_STATUS.COMPLETED : TASK_STATUS.IN_PROGRESS;
      task.status = targetStatus;
      task.logs.push({
        timestamp: now,
        level: 'info',
        message: `Approval APPROVED by ${reviewer}.${feedback ? ` Feedback: ${feedback}` : ''} Moving to '${targetStatus}'.`,
      });

      if (complete) {
        task.lease = null;
        // Free agent slot
        if (task.assignee) {
          const agent = dispatcher.roster.agents.get(task.assignee);
          if (agent) {
            agent.currentTaskIds = agent.currentTaskIds.filter(id => id !== taskId);
            if (agent.currentTaskIds.length < agent.maxConcurrency) {
              agent.status = 'idle';
            }
          }
        }
        dispatcher._resolveDependencies(taskId);
      }
    } else {
      // Rejected: return to in_progress or todo with feedback
      task.status = TASK_STATUS.IN_PROGRESS;
      task.logs.push({
        timestamp: now,
        level: 'warn',
        message: `Approval REJECTED by ${reviewer}. Feedback: ${feedback}. Returned to '${TASK_STATUS.IN_PROGRESS}' for revisions.`,
      });
    }

    return ok({ ...task });
  }

  /**
   * Lists all tasks pending approval
   * @param {import('./dispatcher').TaskDispatcher} dispatcher 
   * @returns {Object[]}
   */
  static listPendingReviews(dispatcher) {
    return dispatcher.listTasks({ status: TASK_STATUS.REVIEW });
  }
}

module.exports = {
  ApprovalGate,
};
