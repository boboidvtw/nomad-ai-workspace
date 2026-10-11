/**
 * Nomad AI Studio - Bot delivery (SPEC-AGENT-BOTS M5)
 * Turns "send this text to that bot" into the right runner for the bot's platform:
 * webview bots run in their canonical chat, local-model bots go to LM Studio with the
 * persona as the system prompt, and extra runners (herdr) plug in by platform name.
 * Governed by AGENTS.md Atomic Contract & Result Pattern.
 */

const { ok, err, ErrorCodes, WEBVIEW_PLATFORMS } = require('@nomad/core');

/**
 * @typedef {(bot: import('@nomad/core').Bot, text: string) => Promise<import('@nomad/core').UnitResult<{ text: string }>>} BotRunner
 *
 * @typedef {Object} BotDeliverDeps
 * @property {(platform: string, prompt: string, context: { agent: any, task?: any }) => Promise<any>} runWebviewTask
 * @property {{ chatCompletion: (req: any) => Promise<any> }} [localModelClient]
 * @property {Record<string, BotRunner>} [runners] - extra runners keyed by platform
 */

/**
 * @param {BotDeliverDeps} deps
 */
function createBotDeliver(deps) {
  /**
   * @param {import('@nomad/core').Bot} bot
   * @param {string} text
   */
  async function deliverLocal(bot, text) {
    if (!deps.localModelClient) {
      return err(ErrorCodes.BOT_INJECT_FAILED_006, 'No local model client is configured');
    }
    const messages = bot.persona
      ? [
          { role: 'system', content: bot.persona },
          { role: 'user', content: text },
        ]
      : [{ role: 'user', content: text }];
    const res = await deps.localModelClient.chatCompletion({ messages });
    if (!res?.success) return res;
    return ok({ text: String(res.data?.content || '') });
  }

  /**
   * @param {import('@nomad/core').Bot} bot
   * @param {string} text
   * @param {{ chainId: string, hops: number, from: string | null }} _meta
   * @returns {Promise<import('@nomad/core').UnitResult<{ text: string }>>}
   */
  return async function deliver(bot, text, _meta) {
    const extra = deps.runners?.[bot.platform];
    if (extra) return extra(bot, text);
    if (bot.platform === 'local-model') return deliverLocal(bot, text);
    if (WEBVIEW_PLATFORMS.includes(bot.platform)) {
      return deps.runWebviewTask(bot.platform, text, { agent: bot });
    }
    return err(
      ErrorCodes.BOT_INJECT_FAILED_006,
      `No runner can deliver to platform ${bot.platform}`,
    );
  };
}

module.exports = {
  createBotDeliver,
};
