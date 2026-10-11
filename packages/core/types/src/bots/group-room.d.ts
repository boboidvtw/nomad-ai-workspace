export type RoomStrategy = "round-robin" | "debate";
export type RoomLogEntry = {
    at: string;
    /**
     * - 'user' or a bot id
     */
    speaker: string;
    text: string;
    error?: boolean | undefined;
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
     */
    constructor(options: {
        roster: import("./bot-roster").BotRoster;
        deliver: import("./message-router").DeliverFn;
        storagePath?: string | undefined;
        onEvent?: ((type: string, data: unknown) => void) | undefined;
    });
    roster: import("./bot-roster").BotRoster;
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
        id: string;
        name: string;
        strategy: RoomStrategy;
        status: "idle" | "running" | "stopped";
        createdAt: string;
    }> | import("../result").UnitFailure<"BOT_ROOM_NOT_FOUND_009">;
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
 * @property {string} speaker - 'user' or a bot id
 * @property {string} text
 * @property {boolean} [error]
 *
 * @typedef {Object} GroupRoom
 * @property {string} id
 * @property {string} name
 * @property {string[]} memberIds
 * @property {RoomStrategy} strategy
 * @property {'idle' | 'running' | 'stopped'} status
 * @property {string[]} held - members that Stop paused
 * @property {RoomLogEntry[]} log
 * @property {string} createdAt
 */
/**
 * @param {RoomStrategy} strategy
 * @param {import('./bot-roster').Bot} bot
 * @param {GroupRoom} room
 * @param {(id: string) => string} nameOf
 */
export function buildMemberPrompt(strategy: RoomStrategy, bot: import("./bot-roster").Bot, room: GroupRoom, nameOf: (id: string) => string): string;
