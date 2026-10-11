/**
 * Nomad AI Studio - Webview Task Runner
 * Runs one task prompt against a platform webview and waits for the settled reply,
 * so TaskRunner gets the AI's actual answer instead of a fire-and-forget receipt.
 * Governed by AGENTS.md Atomic Contract & Result Pattern.
 */

const { ok, err, ErrorCodes } = require('@nomad/core');

/**
 * @typedef {Object} WebviewTaskRunnerDeps
 * @property {(platform: string, text: string) => Promise<Record<string, any>>} inject
 *   Same shape as main.js dispatchPromptToTargets: `{ [platform]: { ok, error? } }`.
 * @property {(platform: string) => Promise<{ settled: boolean, text: string }>} awaitSettled
 */

/**
 * @param {WebviewTaskRunnerDeps} deps
 */
function createWebviewTaskRunner(deps) {
  /** @type {Map<string, Promise<unknown>>} */
  const queues = new Map();

  /**
   * Chains work per platform: one webview can only hold one conversation turn at a time.
   * @template T
   * @param {string} platform
   * @param {() => Promise<T>} work
   * @returns {Promise<T>}
   */
  function enqueue(platform, work) {
    const previous = queues.get(platform) || Promise.resolve();
    const next = previous.then(work, work);
    queues.set(
      platform,
      next.catch(() => undefined),
    );
    return next;
  }

  /**
   * @param {string} platform
   * @param {string} prompt
   */
  async function runOnce(platform, prompt) {
    let injected;
    try {
      injected = await deps.inject(platform, prompt);
    } catch (e) {
      return err(
        ErrorCodes.BOT_INJECT_FAILED_006,
        `Injecting into ${platform} failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    const delivery = injected?.[platform];
    if (!delivery?.ok) {
      return err(
        ErrorCodes.BOT_INJECT_FAILED_006,
        `Injecting into ${platform} failed: ${delivery?.error || 'platform view unavailable'}`,
      );
    }

    const reply = await deps.awaitSettled(platform);
    if (!reply.settled) {
      return err(ErrorCodes.BOT_RESPONSE_TIMEOUT_005, `${platform} did not finish replying`, {
        partialText: reply.text,
      });
    }
    return ok({ text: reply.text });
  }

  return {
    /**
     * @param {string} platform
     * @param {string} prompt
     */
    run(platform, prompt) {
      return enqueue(platform, () => runOnce(platform, prompt));
    },
  };
}

module.exports = {
  createWebviewTaskRunner,
};
