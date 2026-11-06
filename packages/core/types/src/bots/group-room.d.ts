export type RoomStrategy = "round-robin" | "debate";
export type RoomLogEntry = {
    at: string;
    /**
     * - 'user', a bot id, or 'shipping' for SHIP: results
     */
    speaker: string;
    text: string;
    error?: boolean | undefined;
    /**
     * - passed: the member yielded; held: a verbatim repeat
     */
    kind?: "passed" | "held" | undefined;
};
export type RoomDecision = {
    at: string;
    /**
     * - bot id
     */
    by: string;
    text: string;
};
export type GroupRoom = {
    id: string;
    name: string;
    memberIds: string[];
    strategy: RoomStrategy;
    status: "idle" | "running" | "stopped";
    /**
     * - members that Stop paused
     */
    held: string[];
    log: RoomLogEntry[];
    decisions: RoomDecision[];
    createdAt: string;
};
export const DEFAULT_ROOMS_PATH: string;
export class GroupRoomManager {
    /**
     * @param {Object} options
     * @param {import('./bot-roster').BotRoster} options.roster
     * @param {import('./message-router').DeliverFn} options.deliver
     * @param {string} [options.storagePath] - rooms.json; enables auto-persist when set
     * @param {(type: string, data: unknown) => void} [options.onEvent]
     * @param {import('../shipping/shipping-ledger').ShippingLedger | null} [options.shipping] - enables SHIP: lines
     */
    constructor(options: {
        roster: import("./bot-roster").BotRoster;
        deliver: import("./message-router").DeliverFn;
        storagePath?: string | undefined;
        onEvent?: ((type: string, data: unknown) => void) | undefined;
        shipping?: import("../shipping/shipping-ledger").ShippingLedger | null | undefined;
    });
    roster: import("./bot-roster").BotRoster;
    shipping: import("../shipping/shipping-ledger").ShippingLedger | null;
    deliver: import("./message-router").DeliverFn;
    storagePath: string | null;
    onEvent: ((type: string, data: unknown) => void) | null;
    /** @type {Map<string, GroupRoom>} */
    rooms: Map<string, GroupRoom>;
    /** @type {Map<string, string[]>} */
    queues: Map<string, string[]>;
    /** @type {Map<string, Promise<void>>} */
    drives: Map<string, Promise<void>>;
    /**
     * @param {{ name?: string, memberIds?: string[], strategy?: string }} input
     * @returns {import('../result').UnitResult<GroupRoom>}
     */
    create(input: {
        name?: string;
        memberIds?: string[];
        strategy?: string;
    }): import("../result").UnitResult<GroupRoom>;
    list(): {
        memberIds: string[];
        held: string[];
        log: RoomLogEntry[];
        decisions: RoomDecision[];
        id: string;
        name: string;
        strategy: RoomStrategy;
        status: "idle" | "running" | "stopped";
        createdAt: string;
    }[];
    /** @param {string} roomId */
    get(roomId: string): import("../result").UnitSuccess<{
        memberIds: string[];
        held: string[];
        log: RoomLogEntry[];
        decisions: RoomDecision[];
        id: string;
        name: string;
        strategy: RoomStrategy;
        status: "idle" | "running" | "stopped";
        createdAt: string;
    }> | import("../result").UnitFailure<"BOT_ROOM_NOT_FOUND_009">;
    /**
     * Accepts a user message. Returns at once; members reply in the background
     * (use whenIdle to wait).
     * @param {string} roomId
     * @param {{ text?: string }} input
     * @returns {import('../result').UnitResult<{ queued: boolean }>}
     */
    post(roomId: string, input: {
        text?: string;
    }): import("../result").UnitResult<{
        queued: boolean;
    }>;
    /**
     * Holds every member. The member already replying finishes; queued messages are dropped.
     * @param {string} roomId
     */
    stop(roomId: string): import("../result").UnitSuccess<{
        memberIds: string[];
        held: string[];
        log: RoomLogEntry[];
        decisions: RoomDecision[];
        id: string;
        name: string;
        strategy: RoomStrategy;
        status: "idle" | "running" | "stopped";
        createdAt: string;
    }> | import("../result").UnitFailure<"BOT_ROOM_NOT_FOUND_009">;
    /**
     * Deletes a room and its transcript. A room whose members are replying is refused
     * (stop it and wait first), so a running drive never writes to a room that is gone.
     * @param {string} roomId
     * @returns {import('../result').UnitResult<{ removed: string }>}
     */
    remove(roomId: string): import("../result").UnitResult<{
        removed: string;
    }>;
    /**
     * @param {string} roomId
     * @returns {Promise<void>}
     */
    whenIdle(roomId: string): Promise<void>;
    /**
     * @param {GroupRoom} room
     * @param {string} text
     */
    startDrive(room: GroupRoom, text: string): void;
    /**
     * @param {GroupRoom} room
     * @param {string} firstText
     */
    drive(room: GroupRoom, firstText: string): Promise<void>;
    /**
     * Works out who a message addresses and applies the release rules.
     * @param {GroupRoom} room
     * @param {string} text
     * @returns {string[]}
     */
    addressees(room: GroupRoom, text: string): string[];
    /**
     * @param {GroupRoom} room
     * @param {string} memberId
     */
    driveMember(room: GroupRoom, memberId: string): Promise<void>;
    /**
     * Logs a member reply, applying the yield, duplicate and decision rules.
     * @param {GroupRoom} room
     * @param {string} memberId
     * @param {string} text
     */
    recordReply(room: GroupRoom, memberId: string, text: string): void;
    /**
     * @param {GroupRoom} room
     * @param {string} memberId
     * @param {string} text
     */
    recordDecisions(room: GroupRoom, memberId: string, text: string): void;
    /**
     * The shipping block of a member prompt, or none without a ledger.
     * @param {import('./bot-roster').Bot} bot
     * @returns {string[]}
     */
    shippingSection(bot: import("./bot-roster").Bot): string[];
    /**
     * Runs the reply's SHIP: lines as the replying bot and logs the results as one room entry, so
     * the member sees a refusal on its next turn without the results crowding out the transcript.
     * @param {GroupRoom} room
     * @param {string} memberId
     * @param {string} text
     */
    runShipCommands(room: GroupRoom, memberId: string, text: string): void;
    /** @param {string} id */
    nameOf(id: string): string;
    /**
     * @param {GroupRoom} room
     * @param {Omit<RoomLogEntry, 'at'>} entry
     */
    append(room: GroupRoom, entry: Omit<RoomLogEntry, "at">): void;
    /**
     * Replaces the room's fields with new values (never mutates nested arrays in place).
     * @param {GroupRoom} room
     * @param {Partial<GroupRoom>} changes
     */
    update(room: GroupRoom, changes: Partial<GroupRoom>): void;
    /**
     * @param {string} type
     * @param {unknown} data
     */
    emit(type: string, data: unknown): void;
    /** @param {GroupRoom} room */
    snapshot(room: GroupRoom): {
        memberIds: string[];
        held: string[];
        log: RoomLogEntry[];
        decisions: RoomDecision[];
        id: string;
        name: string;
        strategy: RoomStrategy;
        status: "idle" | "running" | "stopped";
        createdAt: string;
    };
    persist(): void;
    /**
     * Restores rooms. A drive cannot survive a restart, so every room comes back idle.
     * @param {string | null} [customPath]
     */
    loadFromDisk(customPath?: string | null): import("../result").UnitFailure<"BOT_STORAGE_LOAD_FAILED_004"> | import("../result").UnitSuccess<{
        loaded: boolean;
        count: number;
    }>;
}
/**
 * @typedef {'round-robin' | 'debate'} RoomStrategy
 *
 * @typedef {Object} RoomLogEntry
 * @property {string} at
 * @property {string} speaker - 'user', a bot id, or 'shipping' for SHIP: results
 * @property {string} text
 * @property {boolean} [error]
 * @property {'passed' | 'held'} [kind] - passed: the member yielded; held: a verbatim repeat
 *
 * @typedef {Object} RoomDecision
 * @property {string} at
 * @property {string} by - bot id
 * @property {string} text
 *
 * @typedef {Object} GroupRoom
 * @property {string} id
 * @property {string} name
 * @property {string[]} memberIds
 * @property {RoomStrategy} strategy
 * @property {'idle' | 'running' | 'stopped'} status
 * @property {string[]} held - members that Stop paused
 * @property {RoomLogEntry[]} log
 * @property {RoomDecision[]} decisions
 * @property {string} createdAt
 */
/**
 * @param {RoomStrategy} strategy
 * @param {import('./bot-roster').Bot} bot
 * @param {GroupRoom} room
 * @param {(id: string) => string} nameOf
 * @param {string[]} [extraSections] - e.g. the shipping block
 */
export function buildMemberPrompt(strategy: RoomStrategy, bot: import("./bot-roster").Bot, room: GroupRoom, nameOf: (id: string) => string, extraSections?: string[]): string;
/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractDecisions(text: string): string[];
/** @param {string} text */
export function isPass(text: string): boolean;
