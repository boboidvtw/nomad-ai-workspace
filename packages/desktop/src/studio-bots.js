/**
 * Nomad AI Studio - Bots wiring (SPEC-AGENT-BOTS)
 * Builds the bot roster, the webview task runner, the message router and its MCP tool in
 * one place so main.js only supplies Electron-specific callbacks.
 * Governed by AGENTS.md Atomic Contract & Result Pattern.
 */

const {
  BotRoster,
  BotMessageRouter,
  registerMessageAgentTool,
  DEFAULT_ROSTER_PATH,
  DEFAULT_ROOMS_PATH,
  GroupRoomManager,
  BOT_STATE,
} = require('@nomad/core');
const { createWebviewTaskRunner } = require('./webview-task-runner');
const { createBotDeliver } = require('./bot-delivery');

/** Tasks can run far longer than a relay turn. */
const TASK_REPLY_TIMEOUT_MS = 180000;

/**
 * @typedef {Object} StudioBotsDeps
 * @property {(platform: string, text: string) => Promise<Record<string, any>>} inject
 * @property {(platform: string, options: { maxWaitMs: number }) => Promise<any>} awaitSettled
 * @property {(platform: string, url: string | null) => Promise<{ ok: boolean, error?: string }>} openChat
 * @property {(platform: string) => Promise<string | null>} currentUrl
 * @property {(notice: any) => void} notify
 * @property {{ chatCompletion: (req: any) => Promise<any> }} [localModelClient]
 * @property {import('@nomad/core').McpGateway} [mcpGateway]
 * @property {Record<string, import('./bot-delivery').BotRunner>} [runners]
 * @property {{ run: import('./bot-delivery').BotRunner, isAvailable: () => Promise<boolean> }} [herdrRunner]
 * @property {string} [rosterPath]
 * @property {string} [roomsPath]
 * @property {(message: string) => void} [warn]
 */

/**
 * @param {StudioBotsDeps} deps
 */
function createStudioBots(deps) {
  const roster = new BotRoster({ storagePath: deps.rosterPath || DEFAULT_ROSTER_PATH });
  const loaded = roster.loadFromDisk();
  if (!loaded.success) deps.warn?.(`Bot roster: ${loaded.message}`);

  const webviewRunner = createWebviewTaskRunner({
    roster,
    inject: deps.inject,
    awaitSettled: (platform) => deps.awaitSettled(platform, { maxWaitMs: TASK_REPLY_TIMEOUT_MS }),
    openChat: deps.openChat,
    currentUrl: deps.currentUrl,
    notify: deps.notify,
  });

  /**
   * @param {string} platform
   * @param {string} prompt
   * @param {any} [context]
   */
  const runWebviewTask = (platform, prompt, context) =>
    webviewRunner.run(platform, prompt, context);

  /** @type {Record<string, import('./bot-delivery').BotRunner>} */
  const runners = {};
  for (const [platform, runner] of Object.entries({
    ...deps.runners,
    ...(deps.herdrRunner ? { herdr: deps.herdrRunner.run } : {}),
  })) {
    runners[platform] = withBotState(roster, runner);
  }

  const deliver = createBotDeliver({
    runWebviewTask,
    localModelClient: deps.localModelClient,
    runners,
  });

  /**
   * TaskRunner delegate: CLI-agent bots (herdr) use their runner, everything else a webview.
   * @param {string} platform
   * @param {string} prompt
   * @param {any} [context]
   */
  const runTask = (platform, prompt, context) => {
    const runner = runners[platform];
    if (runner && context?.agent) return runner(context.agent, prompt);
    return runWebviewTask(platform, prompt, context);
  };
  const router = new BotMessageRouter({ roster, deliver });
  if (deps.mcpGateway) registerMessageAgentTool(deps.mcpGateway, router);

  /** @type {(type: string, data: unknown) => void} */
  let broadcast = () => {};
  const rooms = new GroupRoomManager({
    roster,
    deliver,
    storagePath: deps.roomsPath || DEFAULT_ROOMS_PATH,
    onEvent: (type, data) => broadcast(type, data),
  });
  const roomsLoaded = rooms.loadFromDisk();
  if (!roomsLoaded.success) deps.warn?.(`Group rooms: ${roomsLoaded.message}`);

  return {
    roster,
    router,
    rooms,
    deliver,
    runWebviewTask,
    runTask,
    /**
     * Exposes routing and rooms on the bridge's /api/bots/* routes and room events on SSE.
     * @param {{ botServices: import('@nomad/core').BotServices, broadcast?: (type: string, data: unknown) => void }} bridge
     */
    attach(bridge) {
      bridge.botServices.router = router;
      bridge.botServices.rooms = rooms;
      bridge.botServices.capabilities = async () => ({
        herdr: deps.herdrRunner ? await deps.herdrRunner.isAvailable() : false,
      });
      if (typeof bridge.broadcast === 'function') {
        broadcast = (type, data) => bridge.broadcast?.(type, data);
      }
    },
  };
}

/**
 * Tracks working / done / blocked / unknown for runners that do not track it themselves.
 * @param {import('@nomad/core').BotRoster} roster
 * @param {import('./bot-delivery').BotRunner} runner
 * @returns {import('./bot-delivery').BotRunner}
 */
function withBotState(roster, runner) {
  return async (bot, text) => {
    roster.setBotState(bot.id, BOT_STATE.WORKING);
    const res = await runner(bot, text);
    const blocked = !res.success && Boolean(/** @type {any} */ (res).details?.blocked);
    roster.setBotState(
      bot.id,
      res.success ? BOT_STATE.DONE : blocked ? BOT_STATE.BLOCKED : BOT_STATE.UNKNOWN,
    );
    return res;
  };
}

module.exports = {
  TASK_REPLY_TIMEOUT_MS,
  createStudioBots,
};
