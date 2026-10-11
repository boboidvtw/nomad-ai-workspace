export type Bot = import("./bot-roster").Bot;
export type DeliverFn = (bot: Bot, text: string, meta: {
    chainId: string;
    hops: number;
    from: string | null;
}) => Promise<import("../result").UnitResult<{
    text: string;
}>>;
export type SendInput = {
    /**
     * - mention handle, id or name of the target bot
     */
    to: string;
    message: string;
    /**
     * - sender bot id; omitted or null means the user
     */
    from?: string | null | undefined;
    /**
     * - conversation chain for the loop guard
     */
    chainId?: string | undefined;
    /**
     * - hops already taken in this chain
     */
    hops?: number | undefined;
};
export class BotLoopGuard {
    /**
     * @param {Object} [options]
     * @param {number} [options.maxEvents=20] - messages allowed per chain inside the window
     * @param {number} [options.windowMs=300000]
     * @param {number} [options.cooldownMs=600000] - how long a tripped chain stays closed
     * @param {() => number} [options.now]
     */
    constructor(options?: {
        maxEvents?: number | undefined;
        windowMs?: number | undefined;
        cooldownMs?: number | undefined;
        now?: (() => number) | undefined;
    });
    maxEvents: number;
    windowMs: number;
    cooldownMs: number;
    now: () => number;
    /** @type {Map<string, { events: number[], closedUntil: number }>} */
    chains: Map<string, {
        events: number[];
        closedUntil: number;
    }>;
    /**
     * @param {string} chainKey
     * @returns {{ allowed: boolean, retryAfterMs?: number }}
     */
    admit(chainKey: string): {
        allowed: boolean;
        retryAfterMs?: number;
    };
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
export class BotMessageRouter {
    /**
     * @param {Object} options
     * @param {import('./bot-roster').BotRoster} options.roster
     * @param {DeliverFn} options.deliver
     * @param {BotLoopGuard} [options.guard]
     * @param {number} [options.hopLimit=4]
     */
    constructor(options: {
        roster: import("./bot-roster").BotRoster;
        deliver: DeliverFn;
        guard?: BotLoopGuard | undefined;
        hopLimit?: number | undefined;
    });
    roster: import("./bot-roster").BotRoster;
    deliver: DeliverFn;
    guard: BotLoopGuard;
    hopLimit: number;
    /**
     * @param {SendInput} input
     * @returns {Promise<import('../result').UnitResult<{ to: string, reply: string, chainId: string, hops: number }>>}
     */
    send(input: SendInput): Promise<import("../result").UnitResult<{
        to: string;
        reply: string;
        chainId: string;
        hops: number;
    }>>;
    /**
     * Sends a user prompt to every bot it @mentions, in parallel. Unknown mentions are
     * reported but left in the text untouched (they may be e-mail-like or meant for a human).
     * @param {string} text
     */
    dispatchMentions(text: string): Promise<import("../result").UnitSuccess<{
        routed: ({
            to: string;
            success: boolean;
            reply: string;
            errorCode?: undefined;
            message?: undefined;
        } | {
            to: string;
            success: boolean;
            errorCode: string;
            message: string;
            reply?: undefined;
        })[];
        unknown: string[];
    }>>;
}
export const MAX_MESSAGE_BYTES: number;
/**
 * Extracts unique mention handles. A mention must start the text or follow whitespace or
 * punctuation, so `a@b.com` is not a mention.
 * @param {string} text
 * @returns {string[]}
 */
export function parseMentions(text: string): string[];
/**
 * Registers `message_agent` on an MCP gateway so MCP-capable agents (local models, CLI
 * agents) can message a teammate bot.
 * @param {import('../mcp/mcp-gateway').McpGateway} gateway
 * @param {BotMessageRouter} router
 */
export function registerMessageAgentTool(gateway: import("../mcp/mcp-gateway").McpGateway, router: BotMessageRouter): import("../result").UnitFailure<"MCP_INVALID_PROTOCOL_003"> | import("../result").UnitSuccess<{
    registeredTool: string;
}>;
