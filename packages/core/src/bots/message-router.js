/**
 * Nomad Shared Core - Bot messaging (SPEC-AGENT-BOTS M5)
 * Routes `@mention` prompts from the user and `message_agent` calls between bots.
 * Every hop is bounded twice: a per-chain hop limit and a sliding-window loop guard
 * (after Hermes `gateway/bot_loop_guard.py`), so two bots cannot ping-pong forever.
 *
 * Message text is data. It is delivered as a chat turn to the target bot and never
 * triggers approvals or other control actions.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const crypto = require('crypto');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

const DEFAULT_HOP_LIMIT = 4;
const MAX_MESSAGE_BYTES = 8 * 1024;
const TIMELINE_SNIPPET_LENGTH = 120;

/**
 * Extracts unique mention handles. A mention must start the text or follow whitespace or
 * punctuation, so `a@b.com` is not a mention.
 * @param {string} text
 * @returns {string[]}
 */
function parseMentions(text) {
  /** @type {string[]} */
  const found = [];
  const pattern = /(^|[\s(,;:])@([a-z][a-z0-9_-]{0,31})(?![a-z0-9_@.-]*\.[a-z])/gi;
  for (const match of String(text || '').matchAll(pattern)) {
    const handle = match[2].toLowerCase();
    if (!found.includes(handle)) found.push(handle);
  }
  return found;
}

class BotLoopGuard {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxEvents=20] - messages allowed per chain inside the window
   * @param {number} [options.windowMs=300000]
   * @param {number} [options.cooldownMs=600000] - how long a tripped chain stays closed
   * @param {() => number} [options.now]
   */
  constructor(options = {}) {
    this.maxEvents = options.maxEvents ?? 20;
    this.windowMs = options.windowMs ?? 5 * 60 * 1000;
    this.cooldownMs = options.cooldownMs ?? 10 * 60 * 1000;
    this.now = options.now || Date.now;
    /** @type {Map<string, { events: number[], closedUntil: number }>} */
    this.chains = new Map();
  }

  /**
   * @param {string} chainKey
   * @returns {{ allowed: boolean, retryAfterMs?: number }}
   */
  admit(chainKey) {
    const now = this.now();
    const chain = this.chains.get(chainKey) || { events: [], closedUntil: 0 };
    if (now < chain.closedUntil) {
      return { allowed: false, retryAfterMs: chain.closedUntil - now };
    }
    const events = chain.events.filter((t) => now - t < this.windowMs);
    if (events.length >= this.maxEvents) {
      this.chains.set(chainKey, { events: [], closedUntil: now + this.cooldownMs });
      return { allowed: false, retryAfterMs: this.cooldownMs };
    }
    this.chains.set(chainKey, { events: [...events, now], closedUntil: 0 });
    return { allowed: true };
  }
}

/**
 * @typedef {import('./bot-roster').Bot} Bot
 * @typedef {(bot: Bot, text: string, meta: { chainId: string, hops: number, from: string | null }) => Promise<import('../result').UnitResult<{ text: string }>>} DeliverFn
 */

/**
 * @typedef {Object} SendInput
 * @property {string} to - mention handle, id or name of the target bot
 * @property {string} message
 * @property {string | null} [from] - sender bot id; omitted or null means the user
 * @property {string} [chainId] - conversation chain for the loop guard
 * @property {number} [hops] - hops already taken in this chain
 */

class BotMessageRouter {
  /**
   * @param {Object} options
   * @param {import('./bot-roster').BotRoster} options.roster
   * @param {DeliverFn} options.deliver
   * @param {BotLoopGuard} [options.guard]
   * @param {number} [options.hopLimit=4]
   */
  constructor(options) {
    this.roster = options.roster;
    this.deliver = options.deliver;
    this.guard = options.guard || new BotLoopGuard();
    this.hopLimit = options.hopLimit ?? DEFAULT_HOP_LIMIT;
  }

  /**
   * @param {SendInput} input
   * @returns {Promise<import('../result').UnitResult<{ to: string, reply: string, chainId: string, hops: number }>>}
   */
  async send(input) {
    if (!input || typeof input !== 'object') {
      return err(ErrorCodes.BOT_MESSAGE_INVALID_008, 'Message payload must be an object');
    }
    const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (!message) return err(ErrorCodes.BOT_MESSAGE_INVALID_008, 'Message is empty');
    if (Buffer.byteLength(message, 'utf8') > MAX_MESSAGE_BYTES) {
      return err(ErrorCodes.BOT_MESSAGE_INVALID_008, `Message exceeds ${MAX_MESSAGE_BYTES} bytes`);
    }

    const target = this.roster.resolveMention(String(input.to || ''));
    if (!target.success) return target;

    /** @type {Bot | null} */
    let sender = null;
    if (input.from) {
      const senderRes = this.roster.getAgent(String(input.from));
      if (!senderRes.success) return senderRes;
      sender = /** @type {Bot} */ (senderRes.data);
      if (sender.id === target.data.id) {
        return err(ErrorCodes.BOT_MESSAGE_INVALID_008, 'A bot cannot message itself');
      }
    }

    const hops = Math.max(0, Number(input.hops) || 0) + 1;
    if (hops > this.hopLimit) {
      return err(
        ErrorCodes.BOT_LOOP_GUARD_TRIPPED_007,
        `Relay chain reached the hop limit (${this.hopLimit})`,
      );
    }
    const chainId =
      typeof input.chainId === 'string' && input.chainId ? input.chainId : crypto.randomUUID();
    const admission = this.guard.admit(chainId);
    if (!admission.allowed) {
      return err(ErrorCodes.BOT_LOOP_GUARD_TRIPPED_007, 'Too many bot messages in this chain', {
        retryAfterMs: admission.retryAfterMs,
      });
    }

    const text = sender
      ? `Message from 🤖 ${sender.displayName || sender.name} (@${sender.handle}):\n\n${message}`
      : message;
    const bot = /** @type {Bot} */ (target.data);
    const delivered = await this.deliver(bot, text, { chainId, hops, from: sender?.id || null });
    this.roster.appendTimeline(bot.id, {
      type: 'message',
      from: sender?.id || 'user',
      summary: message.slice(0, TIMELINE_SNIPPET_LENGTH),
    });
    if (!delivered.success) return delivered;
    return ok({ to: bot.id, reply: delivered.data.text, chainId, hops });
  }

  /**
   * Sends a user prompt to every bot it @mentions, in parallel. Unknown mentions are
   * reported but left in the text untouched (they may be e-mail-like or meant for a human).
   * @param {string} text
   */
  async dispatchMentions(text) {
    const handles = parseMentions(text);
    /** @type {string[]} */
    const unknown = [];
    /** @type {Bot[]} */
    const targets = [];
    for (const handle of handles) {
      const res = this.roster.resolveMention(handle);
      if (!res.success) unknown.push(handle);
      else if (!targets.some((t) => t.id === res.data.id))
        targets.push(/** @type {Bot} */ (res.data));
    }
    const results = await Promise.all(
      targets.map(async (bot) => {
        const res = await this.send({ to: bot.id, message: text });
        return res.success
          ? { to: bot.id, success: true, reply: res.data.reply }
          : { to: bot.id, success: false, errorCode: res.errorCode, message: res.message };
      }),
    );
    return ok({ routed: results, unknown });
  }
}

/**
 * Registers `message_agent` on an MCP gateway so MCP-capable agents (local models, CLI
 * agents) can message a teammate bot.
 * @param {import('../mcp/mcp-gateway').McpGateway} gateway
 * @param {BotMessageRouter} router
 */
function registerMessageAgentTool(gateway, router) {
  return gateway.registerTool({
    name: 'message_agent',
    description: '傳訊息給另一個 Nomad Bot（以 @handle、id 或名稱指定），回傳對方的回覆',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '目標 Bot 的 @handle、id 或名稱' },
        message: { type: 'string', description: '要傳給對方的訊息（最多 8KB）' },
        from: { type: 'string', description: '發送方 Bot id（選填）' },
        chainId: { type: 'string', description: '延續既有對話鏈時帶入（選填）' },
        hops: { type: 'number', description: '目前對話鏈已經轉手的次數（選填）' },
      },
      required: ['target', 'message'],
    },
    handler: async (/** @type {Record<string, any>} */ args) =>
      router.send({
        to: args.target,
        message: args.message,
        from: args.from || null,
        chainId: args.chainId,
        hops: args.hops,
      }),
  });
}

module.exports = {
  BotLoopGuard,
  BotMessageRouter,
  MAX_MESSAGE_BYTES,
  parseMentions,
  registerMessageAgentTool,
};
