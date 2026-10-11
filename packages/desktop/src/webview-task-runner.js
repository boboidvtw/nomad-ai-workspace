/**
 * Nomad AI Studio - Webview Task Runner
 * Runs one task prompt against a platform webview and waits for the settled reply,
 * so TaskRunner gets the AI's actual answer instead of a fire-and-forget receipt.
 *
 * When the task targets a bot (SPEC-AGENT-BOTS M2) the run happens inside the bot's
 * canonical chat: the first run opens a new conversation, sends the persona and binds the
 * resulting URL; later runs reopen that conversation. A conversation that no longer opens
 * is rebound to a fresh one and logged on the bot's timeline.
 * Governed by AGENTS.md Atomic Contract & Result Pattern.
 */

const {
  ok,
  err,
  ErrorCodes,
  BOT_STATE,
  isConversationUrl,
  isSameConversation,
} = require('@nomad/core');

const DEFAULT_BLOCKED_POLL_MS = 5000;
const DEFAULT_MAX_BLOCKED_MS = 15 * 60 * 1000;

/**
 * @typedef {Object} WebviewTaskRunnerDeps
 * @property {(platform: string, text: string) => Promise<Record<string, any>>} inject
 *   Same shape as main.js dispatchPromptToTargets: `{ [platform]: { ok, error? } }`.
 * @property {(platform: string) => Promise<{ settled: boolean, text: string, blocked?: boolean, reason?: string }>} awaitSettled
 * @property {import('@nomad/core').BotRoster} [roster]
 * @property {(platform: string, url: string | null) => Promise<{ ok: boolean, error?: string }>} [openChat]
 *   Loads `url`, or a new conversation when null, and resolves once the page is ready.
 * @property {(platform: string) => Promise<string | null>} [currentUrl]
 * @property {(notice: BlockedNotice) => void} [notify] - called once when a run becomes blocked
 * @property {number} [blockedPollMs=5000] - how often to re-check a blocked page
 * @property {number} [maxBlockedMs=900000] - give up after the page stays blocked this long
 * @property {(ms: number) => Promise<void>} [sleep]
 * @property {() => number} [now]
 *
 * @typedef {{ botId: string | null, botName: string | null, platform: string, reason: string }} BlockedNotice
 * @typedef {{ onBlocked?: (reason: string) => void, onUnblocked?: () => void }} WaitHooks
 *
 * @typedef {{ agent?: { id: string } | null, task?: { id: string, title?: string } | null }} RunContext
 */

/**
 * @param {WebviewTaskRunnerDeps} deps
 */
function createWebviewTaskRunner(deps) {
  /** @type {Map<string, Promise<unknown>>} */
  const queues = new Map();
  const botAware = Boolean(deps.roster && deps.openChat && deps.currentUrl);
  const blockedPollMs = deps.blockedPollMs ?? DEFAULT_BLOCKED_POLL_MS;
  const maxBlockedMs = deps.maxBlockedMs ?? DEFAULT_MAX_BLOCKED_MS;
  const sleep = deps.sleep || ((/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)));
  const now = deps.now || Date.now;

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
   * Waits for the reply. A blocked page (usage limit, signed out) does not fail the run:
   * the user is told once and the wait continues until the page recovers or the budget ends.
   * @param {string} platform
   * @param {WaitHooks} hooks
   */
  async function waitForReply(platform, hooks) {
    /** @type {number | null} */
    let blockedSince = null;
    for (;;) {
      const reply = await deps.awaitSettled(platform);
      if (!reply.blocked && blockedSince !== null) {
        blockedSince = null;
        hooks.onUnblocked?.();
      }
      if (reply.settled) return ok({ text: reply.text });
      if (!reply.blocked) {
        return err(ErrorCodes.BOT_RESPONSE_TIMEOUT_005, `${platform} did not finish replying`, {
          partialText: reply.text,
        });
      }
      const reason = reply.reason || 'needs attention';
      if (blockedSince === null) {
        blockedSince = now();
        hooks.onBlocked?.(reason);
      }
      if (now() - blockedSince >= maxBlockedMs) {
        return err(ErrorCodes.BOT_RESPONSE_TIMEOUT_005, `${platform} stayed blocked: ${reason}`, {
          blocked: true,
          reason,
        });
      }
      await sleep(blockedPollMs);
    }
  }

  /**
   * @param {string} platform
   * @param {string} prompt
   * @param {WaitHooks} [hooks]
   */
  async function injectAndWait(platform, prompt, hooks = {}) {
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

    return waitForReply(platform, {
      onBlocked: (reason) => {
        deps.notify?.({ botId: null, botName: null, platform, reason });
      },
      ...hooks,
    });
  }

  /**
   * Opens the bot's conversation. Returns whether the persona must be sent (a new chat).
   * @param {import('@nomad/core').Bot} bot
   * @param {string} platform
   * @returns {Promise<import('@nomad/core').UnitResult<{ freshChat: boolean }>>}
   */
  async function openBotChat(bot, platform) {
    const roster = /** @type {import('@nomad/core').BotRoster} */ (deps.roster);
    const openChat = /** @type {NonNullable<WebviewTaskRunnerDeps['openChat']>} */ (deps.openChat);
    const currentUrl = /** @type {NonNullable<WebviewTaskRunnerDeps['currentUrl']>} */ (
      deps.currentUrl
    );
    const boundUrl = bot.canonicalChat?.url || null;

    if (boundUrl) {
      const opened = await openChat(platform, boundUrl);
      const landed = opened.ok ? await currentUrl(platform) : null;
      if (opened.ok && isSameConversation(landed, boundUrl)) {
        return ok({ freshChat: false });
      }
      roster.bindCanonicalChat(bot.id, { platform, url: null });
      roster.appendTimeline(bot.id, {
        type: 'chat-rebound',
        summary: `Conversation ${boundUrl} did not open (landed on ${landed || 'nothing'}); starting a new one`,
      });
    }

    const opened = await openChat(platform, null);
    if (!opened.ok) {
      return err(
        ErrorCodes.BOT_INJECT_FAILED_006,
        `Could not open a new ${platform} chat: ${opened.error || 'unknown error'}`,
      );
    }
    return ok({ freshChat: true });
  }

  /**
   * @param {string} platform
   * @param {string} prompt
   * @param {RunContext} context
   */
  async function runForBot(platform, prompt, context) {
    const roster = /** @type {import('@nomad/core').BotRoster} */ (deps.roster);
    const botRes = roster.getAgent(/** @type {{ id: string }} */ (context.agent).id);
    if (!botRes.success) return injectAndWait(platform, prompt);
    const bot = /** @type {import('@nomad/core').Bot} */ (botRes.data);
    const boundElsewhere = bot.canonicalChat && bot.canonicalChat.platform !== platform;
    if (boundElsewhere) return injectAndWait(platform, prompt);

    roster.setBotState(bot.id, BOT_STATE.WORKING);
    const chat = await openBotChat(bot, platform);
    if (!chat.success) {
      roster.setBotState(bot.id, BOT_STATE.UNKNOWN);
      return chat;
    }
    const text = chat.data.freshChat && bot.persona ? `${bot.persona}\n\n---\n\n${prompt}` : prompt;
    const res = await injectAndWait(platform, text, {
      onBlocked: (reason) => {
        roster.setBotState(bot.id, BOT_STATE.BLOCKED);
        roster.appendTimeline(bot.id, { type: 'state', summary: `Blocked: ${reason}` });
        deps.notify?.({ botId: bot.id, botName: bot.displayName || bot.name, platform, reason });
      },
      onUnblocked: () => {
        roster.setBotState(bot.id, BOT_STATE.WORKING);
      },
    });

    if (chat.data.freshChat) {
      const landed =
        await /** @type {NonNullable<WebviewTaskRunnerDeps['currentUrl']>} */ (deps.currentUrl)(
          platform,
        );
      if (isConversationUrl(platform, landed)) {
        roster.bindCanonicalChat(bot.id, { platform, url: landed });
      }
    }
    const stillBlocked =
      !res.success &&
      Boolean(/** @type {{ blocked?: boolean } | undefined} */ (res.details)?.blocked);
    if (!stillBlocked) {
      roster.setBotState(bot.id, res.success ? BOT_STATE.DONE : BOT_STATE.UNKNOWN);
    }
    if (context.task) {
      roster.appendTimeline(bot.id, {
        type: 'task',
        taskId: context.task.id,
        summary: `${res.success ? 'Finished' : 'Failed'}: ${context.task.title || context.task.id}`,
      });
    }
    return res;
  }

  return {
    /**
     * @param {string} platform
     * @param {string} prompt
     * @param {RunContext} [context]
     */
    run(platform, prompt, context = {}) {
      return enqueue(platform, () =>
        botAware && context.agent
          ? runForBot(platform, prompt, context)
          : injectAndWait(platform, prompt),
      );
    },
  };
}

module.exports = {
  createWebviewTaskRunner,
};
