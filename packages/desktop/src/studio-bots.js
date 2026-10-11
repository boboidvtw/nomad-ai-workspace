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

  const deliver = createBotDeliver({
    runWebviewTask,
    localModelClient: deps.localModelClient,
    runners: deps.runners,
  });
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
    /**
     * Exposes routing and rooms on the bridge's /api/bots/* routes and room events on SSE.
     * @param {{ botServices: import('@nomad/core').BotServices, broadcast?: (type: string, data: unknown) => void }} bridge
     */
    attach(bridge) {
      bridge.botServices.router = router;
      bridge.botServices.rooms = rooms;
      if (typeof bridge.broadcast === 'function') {
        broadcast = (type, data) => bridge.broadcast?.(type, data);
      }
    },
  };
}

module.exports = {
  TASK_REPLY_TIMEOUT_MS,
  createStudioBots,
};
