export type BotState = "idle" | "working" | "blocked" | "done" | "unknown";
export type CanonicalChat = {
    platform: string;
    url: string | null;
    herdrAgentName?: string | null | undefined;
    boundAt?: string | undefined;
};
export type BotTimelineEntry = {
    at: string;
    /**
     * - 'routine' | 'task' | 'message' | 'state' | 'chat-rebound'
     */
    type: string;
    summary: string;
    taskId?: string | undefined;
    scheduleId?: string | undefined;
    from?: string | undefined;
};
export type BotFields = {
    handle: string;
    displayName?: string | undefined;
    persona?: string | undefined;
    avatar?: string | undefined;
    canonicalChat: CanonicalChat | null;
    sections: string[];
    hidden: boolean;
    state: BotState;
    lastSeenAt: string | null;
    stateChangedAt: string | null;
    timeline: BotTimelineEntry[];
};
export type Bot = import("../tasks/roster").Agent & BotFields;
export const BOT_STATE: Readonly<{
    IDLE: "idle";
    WORKING: "working";
    BLOCKED: "blocked";
    DONE: "done";
    UNKNOWN: "unknown";
}>;
export const DEFAULT_ROSTER_PATH: string;
export const MAX_TIMELINE_ENTRIES: 50;
export class BotRoster extends AgentRoster {
    /**
     * @param {Object} [options]
     * @param {string} [options.storagePath] - roster.json path; enables auto-persist when set
     * @param {boolean} [options.autoPersist]
     * @param {import('../tasks/roster').Agent[]} [options.seed]
     * @param {(type: 'bot:updated' | 'bot:removed', data: unknown) => void} [options.onEvent]
     */
    constructor(options?: {
        storagePath?: string | undefined;
        autoPersist?: boolean | undefined;
        seed?: import("../tasks/roster").Agent[] | undefined;
        onEvent?: ((type: "bot:updated" | "bot:removed", data: unknown) => void) | undefined;
    });
    /** @type {((type: 'bot:updated' | 'bot:removed', data: unknown) => void) | null} */
    onEvent: ((type: "bot:updated" | "bot:removed", data: unknown) => void) | null;
    storagePath: string | null;
    autoPersist: boolean;
    /**
     * Legacy registration path. Keeps existing bot fields so the old API cannot wipe a persona.
     * @param {Partial<Bot>} profile
     */
    registerAgent(profile: Partial<Bot>): import("../result").UnitFailure<string> | import("../result").UnitSuccess<{
        id: string;
        name: string;
        role: string;
        /**
         * - Webview platform id or 'local-model'
         */
        platform: string;
        skills: string[];
        status: import("../tasks/roster").AgentStatus;
        maxConcurrency: number;
        budgetTokenLimit: number;
        currentTaskIds: string[];
        handle: string;
        displayName?: string | undefined;
        persona?: string | undefined;
        avatar?: string | undefined;
        canonicalChat: CanonicalChat | null;
        sections: string[];
        hidden: boolean;
        state: BotState;
        lastSeenAt: string | null;
        stateChangedAt: string | null;
        timeline: BotTimelineEntry[];
    }>;
    /**
     * Appends -2, -3, ... until no other bot uses the handle.
     * @param {string} base
     * @param {string} selfId
     * @returns {string}
     */
    uniqueHandle(base: string, selfId: string): string;
    /**
     * @param {string} handle
     * @returns {Bot | null}
     */
    findByHandle(handle: string): Bot | null;
    /**
     * Applies an editable patch and returns the new bot. Never mutates the stored object.
     * @param {string} id
     * @param {Record<string, unknown>} patch
     * @returns {import('../result').UnitResult<Bot>}
     */
    updateBot(id: string, patch: Record<string, unknown>): import("../result").UnitResult<Bot>;
    /**
     * @param {string} id
     * @returns {import('../result').UnitResult<{ removed: string }>}
     */
    removeBot(id: string): import("../result").UnitResult<{
        removed: string;
    }>;
    /**
     * Resolves `@handle`, an id, or a compacted old name to a bot.
     * @param {string} mention
     * @returns {import('../result').UnitResult<Bot>}
     */
    resolveMention(mention: string): import("../result").UnitResult<Bot>;
    /**
     * @param {string} id
     * @param {{ platform: string, url: string | null, herdrAgentName?: string | null }} chat
     */
    bindCanonicalChat(id: string, chat: {
        platform: string;
        url: string | null;
        herdrAgentName?: string | null;
    }): import("../result").UnitResult<Bot, string>;
    /**
     * @param {string} id
     * @param {BotState} state
     */
    setBotState(id: string, state: BotState): import("../result").UnitResult<Bot, string>;
    /**
     * Marks a bot's latest reply as seen; a `done` bot becomes `idle`.
     * @param {string} id
     */
    markSeen(id: string): import("../result").UnitResult<Bot, string>;
    /**
     * @param {string} id
     * @param {Omit<BotTimelineEntry, 'at'>} entry
     */
    appendTimeline(id: string, entry: Omit<BotTimelineEntry, "at">): import("../result").UnitResult<Bot, string>;
    /**
     * @param {string} id
     * @param {(bot: Bot) => Partial<Bot>} change
     * @param {boolean} [persist=true]
     * @returns {import('../result').UnitResult<Bot>}
     */
    replaceBot(id: string, change: (bot: Bot) => Partial<Bot>, persist?: boolean): import("../result").UnitResult<Bot>;
    /**
     * @param {'bot:updated' | 'bot:removed'} type
     * @param {unknown} data
     */
    emit(type: "bot:updated" | "bot:removed", data: unknown): void;
    /** @returns {Bot[]} */
    listBots(): Bot[];
    /**
     * Payload for Google Drive `Shared/`: persona and settings only. Chat URLs are tied to
     * the signed-in browser account, and runtime state belongs to this machine.
     */
    toSyncPayload(): {
        version: number;
        bots: {
            id: string;
            name: string;
            role: string;
            /**
             * - Webview platform id or 'local-model'
             */
            platform: string;
            skills: string[];
            maxConcurrency: number;
            budgetTokenLimit: number;
            handle: string;
            displayName?: string | undefined;
            persona?: string | undefined;
            avatar?: string | undefined;
            sections: string[];
            hidden: boolean;
        }[];
    };
    /**
     * Merges bots from a Drive payload. Local chat bindings, timelines and runtime state win.
     * @param {{ version?: number, bots?: unknown[] }} payload
     * @returns {import('../result').UnitResult<{ merged: number }>}
     */
    applySyncPayload(payload: {
        version?: number;
        bots?: unknown[];
    }): import("../result").UnitResult<{
        merged: number;
    }>;
    persist(): void;
    /**
     * @param {string | null} [customPath]
     * @returns {import('../result').UnitResult<{ persisted: boolean, path?: string, count: number }>}
     */
    saveToDiskSync(customPath?: string | null): import("../result").UnitResult<{
        persisted: boolean;
        path?: string;
        count: number;
    }>;
    /** @param {string | null} [customPath] */
    saveToDisk(customPath?: string | null): Promise<import("../result").UnitResult<{
        persisted: boolean;
        path?: string;
        count: number;
    }, string>>;
    /**
     * Loads roster.json. A corrupt file is renamed to `.corrupt-<ts>` and the seed roster stays.
     * @param {string | null} [customPath]
     * @param {{ quarantine?: boolean }} [options] - read-only callers (the daemon) pass false
     * @returns {import('../result').UnitResult<{ loaded: boolean, count: number }>}
     */
    loadFromDisk(customPath?: string | null, options?: {
        quarantine?: boolean;
    }): import("../result").UnitResult<{
        loaded: boolean;
        count: number;
    }>;
}
/**
 * @typedef {'idle'|'working'|'blocked'|'done'|'unknown'} BotState
 *
 * @typedef {Object} CanonicalChat
 * @property {string} platform
 * @property {string | null} url
 * @property {string | null} [herdrAgentName]
 * @property {string} [boundAt]
 *
 * @typedef {Object} BotTimelineEntry
 * @property {string} at
 * @property {string} type - 'routine' | 'task' | 'message' | 'state' | 'chat-rebound'
 * @property {string} summary
 * @property {string} [taskId]
 * @property {string} [scheduleId]
 * @property {string} [from]
 *
 * @typedef {Object} BotFields
 * @property {string} handle
 * @property {string} [displayName]
 * @property {string} [persona]
 * @property {string} [avatar]
 * @property {CanonicalChat | null} canonicalChat
 * @property {string[]} sections
 * @property {boolean} hidden
 * @property {BotState} state
 * @property {string | null} lastSeenAt
 * @property {string | null} stateChangedAt
 * @property {BotTimelineEntry[]} timeline
 *
 * @typedef {import('../tasks/roster').Agent & BotFields} Bot
 */
/**
 * Turns a display name into an @mention handle matching `[a-z][a-z0-9_-]{0,31}`.
 * Returns '' when nothing ASCII is left, so callers can fall back to the id.
 * @param {string} name
 * @returns {string}
 */
export function toBotHandle(name: string): string;
import { AgentRoster } from "../tasks/roster";
