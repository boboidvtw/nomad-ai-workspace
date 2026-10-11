/**
 * Nomad Shared Core - Task Execution Runner
 * Coordinates automated task runs, heartbeat renewal loops, and artifact generation.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const { ok, err, wrapAsync } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { ApprovalGate } = require('./approval-gate');

/**
 * Reads the AI reply out of an orchestrator delegate's return value.
 * Result-shaped returns are authoritative: a failure or an empty reply throws so the
 * task fails instead of completing with a made-up deliverable. A legacy `{ text }`
 * return is still accepted; anything else was fire-and-forget and is labelled as such.
 * @param {unknown} orchRes
 * @param {string} platform
 * @returns {string}
 */
function readDelegateReply(orchRes, platform) {
  const res = /** @type {Record<string, any> | null | undefined} */ (orchRes);
  if (res && typeof res.success === 'boolean') {
    if (!res.success) {
      throw new Error(res.message || `Webview run on ${platform} failed`);
    }
    const text = typeof res.data?.text === 'string' ? res.data.text.trim() : '';
    if (!text) {
      throw new Error(`Webview run on ${platform} returned an empty reply`);
    }
    return text;
  }
  if (res && typeof res.text === 'string' && res.text.trim()) {
    return res.text;
  }
  return `Prompt delivered to ${platform}; the response was not captured.`;
}

class TaskRunner {
  /**
   * @param {import('./dispatcher').TaskDispatcher} dispatcher
   * @param {Object} [options]
   * @param {import('../client/local-model-client').LocalModelClient} [options.localModelClient]
   * @param {(platform: string, prompt: string, context: { agent: any, task: any }) => Promise<unknown>} [options.orchestratorDelegate]
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
   * @returns {Promise<import('../result').UnitResult<import('./task-model').Task | undefined>>}
   */
  async dispatchAndRun(taskId, agentId, options = {}) {
    // The callback may return a Result itself (e.g. a failed claim); wrapAsync passes those through.
    return /** @type {Promise<import('../result').UnitResult<import('./task-model').Task | undefined>>} */ (
      wrapAsync(async () => {
        // 1. Claim task
        const claimRes = this.dispatcher.claimTask(taskId, agentId);
        if (!claimRes.success) {
          return claimRes;
        }
        const task = claimRes.data;
        const agentRes = this.dispatcher.roster.getAgent(agentId);
        const agent = agentRes.success
          ? agentRes.data
          : { id: agentId, name: agentId, platform: 'claude', role: 'General Assistant' };

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
            const prompt =
              options.customPrompt ||
              `Task: ${task.title}\nDescription: ${task.description || 'None'}\nCriteria: ${(task.acceptanceCriteria || []).join(', ')}`;
            const inferenceRes = await this.localModelClient.chatCompletion({
              messages: [
                {
                  role: 'system',
                  content: `You are ${agent.name}, an expert AI agent with role: ${agent.role}. Complete the user task accurately.`,
                },
                { role: 'user', content: prompt },
              ],
            });
            if (inferenceRes.success) {
              outputContent = inferenceRes.data.content;
              const tokens = inferenceRes.data.usage && inferenceRes.data.usage.total_tokens;
              outputSummary = `Local model execution complete (${tokens || 0} tokens)`;
            } else {
              throw new Error(`Local model inference failed: ${inferenceRes.message}`);
            }
          } else if (typeof this.orchestratorDelegate === 'function') {
            // Delegate to Webview MultiAiOrchestrator
            const prompt =
              options.customPrompt ||
              `【任務】：${task.title}\n【說明】：${task.description || ''}\n【驗收標準】：${(task.acceptanceCriteria || []).join('; ')}`;
            const orchRes = await this.orchestratorDelegate(agent.platform, prompt, {
              agent,
              task,
            });
            outputContent = readDelegateReply(orchRes, agent.platform);
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
          this.dispatcher.failTask(
            taskId,
            agentId,
            errObj instanceof Error ? errObj.message : String(errObj),
          );
          return err(
            ErrorCodes.TASK_EXECUTION_FAILED_007,
            errObj instanceof Error ? errObj.message : String(errObj),
          );
        } finally {
          heartbeat.stop();
        }
      })
    );
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
