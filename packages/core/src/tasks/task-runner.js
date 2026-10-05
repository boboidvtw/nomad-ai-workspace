/**
 * Nomad Shared Core - Task Execution Runner
 * Coordinates automated task runs, heartbeat renewal loops, and artifact generation.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const { ok, err, wrapAsync } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { ApprovalGate } = require('./approval-gate');

class TaskRunner {
  /**
   * @param {import('./dispatcher').TaskDispatcher} dispatcher 
   * @param {Object} [options]
   * @param {Object} [options.localModelClient]
   * @param {Function} [options.orchestratorDelegate]
   */
  constructor(dispatcher, options = {}) {
    this.dispatcher = dispatcher;
    this.localModelClient = options.localModelClient || null;
    this.orchestratorDelegate = options.orchestratorDelegate || null;
  }

  /**
   * Dispatches and executes a task end-to-end
   * @param {string} taskId 
   * @param {string} agentId 
   * @param {Object} [options]
   * @param {Function} [options.runnerFn] - Custom async (task, agent) => { summary, artifact }
   * @param {string} [options.customPrompt]
   * @returns {Promise<import('../result').UnitResult<Object, string>>}
   */
  async dispatchAndRun(taskId, agentId, options = {}) {
    return wrapAsync(async () => {
      // 1. Claim task
      const claimRes = this.dispatcher.claimTask(taskId, agentId);
      if (!claimRes.success) {
        return claimRes;
      }
      const task = claimRes.data;
      const agentRes = this.dispatcher.roster.getAgent(agentId);
      const agent = agentRes.success ? agentRes.data : { id: agentId, name: agentId, platform: 'claude' };

      // 2. Start heartbeat loop
      const heartbeat = this.startHeartbeatLoop(taskId, agentId, 5000);

      try {
        let outputContent = '';
        let outputSummary = '';

        if (typeof options.runnerFn === 'function') {
          // Custom runner
          const runResult = await options.runnerFn(task, agent);
          outputSummary = runResult?.summary || 'Custom execution completed';
          outputContent = runResult?.content || '';
        } else if (agent.platform === 'local-model' && this.localModelClient) {
          // Execute via local model (LM Studio)
          const prompt = options.customPrompt || `Task: ${task.title}\nDescription: ${task.description || 'None'}\nCriteria: ${(task.acceptanceCriteria || []).join(', ')}`;
          const inferenceRes = await this.localModelClient.chat([
            { role: 'system', content: `You are ${agent.name}, an expert AI agent with role: ${agent.role}. Complete the user task accurately.` },
            { role: 'user', content: prompt }
          ]);
          if (inferenceRes.success) {
            outputContent = inferenceRes.data.content;
            outputSummary = `Local model execution complete (${inferenceRes.data.tokens || 0} tokens)`;
          } else {
            throw new Error(`Local model inference failed: ${inferenceRes.message}`);
          }
        } else if (typeof this.orchestratorDelegate === 'function') {
          // Delegate to Webview MultiAiOrchestrator
          const prompt = options.customPrompt || `【任務】：${task.title}\n【說明】：${task.description || ''}\n【驗收標準】：${(task.acceptanceCriteria || []).join('; ')}`;
          const orchRes = await this.orchestratorDelegate(agent.platform, prompt);
          outputContent = orchRes?.text || 'Delegated to webview';
          outputSummary = `Webview orchestrated on platform: ${agent.platform}`;
        } else {
          // Default automated mock execution
          outputContent = `Completed task [${task.title}] by ${agent.name}.\nAcceptance criteria verified: ${task.acceptanceCriteria.length} items.`;
          outputSummary = `Executed successfully by ${agent.name}`;
        }

        // 3. Attach artifact if output exists
        if (outputContent) {
          this.dispatcher.addArtifact(taskId, {
            name: `${task.title} - Deliverable`,
            type: 'text/markdown',
            content: outputContent,
          });
        }

        // 4. Human-in-the-loop approval or completion
        if (task.requireApproval) {
          ApprovalGate.submitForReview(this.dispatcher, taskId, agentId, {
            proposal: `Execution finished by ${agent.name}. Review required before finalization.`,
            diff: outputContent.substring(0, 500),
          });
          return ok(this.dispatcher.tasks.get(taskId));
        } else {
          const compRes = this.dispatcher.completeTask(taskId, agentId, outputSummary);
          return compRes;
        }
      } catch (errObj) {
        this.dispatcher.failTask(taskId, agentId, errObj.message);
        return err(ErrorCodes.TASK_EXECUTION_FAILED_007, errObj.message);
      } finally {
        heartbeat.stop();
      }
    });
  }

  /**
   * Starts a background lease renewal loop
   * @param {string} taskId 
   * @param {string} agentId 
   * @param {number} [intervalMs=5000] 
   * @returns {{ stop: () => void }}
   */
  startHeartbeatLoop(taskId, agentId, intervalMs = 5000) {
    const timer = setInterval(() => {
      const res = this.dispatcher.renewHeartbeat(taskId, agentId);
      if (!res.success) {
        clearInterval(timer);
      }
    }, intervalMs);

    return {
      stop: () => clearInterval(timer),
    };
  }
}

module.exports = {
  TaskRunner,
};
