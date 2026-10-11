/**
 * Nomad Shared Core - Group rooms (SPEC-AGENT-BOTS M6)
 * Several bots share one transcript. A user message drives the addressed members one after
 * another; each member sees what the others said before it. Following Hermes group chats:
 *   - messages sent while members are replying queue behind the current drive;
 *   - Stop holds every member (the turn already running finishes, no new turns start);
 *   - mentioning a held member releases it, and `@all` / `@everyone` releases the room.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { parseMentions } = require('./message-router');

const DEFAULT_ROOMS_PATH = path.join(os.homedir(), '.nomad', 'rooms.json');
const MAX_LOG_ENTRIES = 200;
const CONTEXT_ENTRIES = 12;
const MAX_POST_LENGTH = 8000;
const RELEASE_ALL = new Set(['all', 'everyone']);

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
function buildMemberPrompt(strategy, bot, room, nameOf) {
  const transcript = room.log
    .slice(-CONTEXT_ENTRIES)
    .map((entry) => `[${entry.speaker === 'user' ? 'User' : nameOf(entry.speaker)}]: ${entry.text}`)
    .join('\n\n');
  const others = room.memberIds
    .filter((id) => id !== bot.id)
    .map(nameOf)
    .join(', ');
  const task =
    strategy === 'debate'
      ? 'Critically review the latest proposal: point out flaws, risks and edge cases, then offer a better option.'
      : 'Reply to the latest message from your own role. Build on what the others said; do not repeat them.';
  return [
    `You are ${bot.displayName || bot.name} (@${bot.handle}) in the group room "${room.name}" with ${others || 'no one else'}.`,
    task,
    '--- Room transcript ---',
    transcript,
  ].join('\n\n');
}

class GroupRoomManager {
  /**
   * @param {Object} options
   * @param {import('./bot-roster').BotRoster} options.roster
   * @param {import('./message-router').DeliverFn} options.deliver
   * @param {string} [options.storagePath] - rooms.json; enables auto-persist when set
   * @param {(type: string, data: unknown) => void} [options.onEvent]
   */
  constructor(options) {
    this.roster = options.roster;
    this.deliver = options.deliver;
    this.storagePath = options.storagePath || null;
    this.onEvent = options.onEvent || null;
    /** @type {Map<string, GroupRoom>} */
    this.rooms = new Map();
    /** @type {Map<string, string[]>} */
    this.queues = new Map();
    /** @type {Map<string, Promise<void>>} */
    this.drives = new Map();
  }

  /**
   * @param {{ name?: string, memberIds?: string[], strategy?: string }} input
   * @returns {import('../result').UnitResult<GroupRoom>}
   */
  create(input) {
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    const memberIds = Array.isArray(input?.memberIds) ? [...new Set(input.memberIds)] : [];
    if (!name || memberIds.length === 0) {
      return err(ErrorCodes.BOT_MESSAGE_INVALID_008, 'A room needs a name and at least one member');
    }
    const missing = memberIds.find((id) => !this.roster.getAgent(id).success);
    if (missing) {
      return err(ErrorCodes.ROSTER_AGENT_NOT_FOUND_001, `Bot '${missing}' is not in the roster`);
    }
    /** @type {GroupRoom} */
    const room = {
      id: `room-${crypto.randomUUID()}`,
      name,
      memberIds,
      strategy: input.strategy === 'debate' ? 'debate' : 'round-robin',
      status: 'idle',
      held: [],
      log: [],
      createdAt: new Date().toISOString(),
    };
    this.rooms.set(room.id, room);
    this.persist();
    return ok(this.snapshot(room));
  }

  list() {
    return Array.from(this.rooms.values()).map((room) => this.snapshot(room));
  }

  /** @param {string} roomId */
  get(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return err(ErrorCodes.BOT_ROOM_NOT_FOUND_009, `Room '${roomId}' not found`);
    return ok(this.snapshot(room));
  }

  /**
   * Accepts a user message. Returns at once; members reply in the background
   * (use whenIdle to wait).
   * @param {string} roomId
   * @param {{ text?: string }} input
   * @returns {import('../result').UnitResult<{ queued: boolean }>}
   */
  post(roomId, input) {
    const room = this.rooms.get(roomId);
    if (!room) return err(ErrorCodes.BOT_ROOM_NOT_FOUND_009, `Room '${roomId}' not found`);
    const text = typeof input?.text === 'string' ? input.text.trim() : '';
    if (!text || text.length > MAX_POST_LENGTH) {
      return err(ErrorCodes.BOT_MESSAGE_INVALID_008, `Message must be 1-${MAX_POST_LENGTH} chars`);
    }
    if (room.status === 'running') {
      this.queues.set(roomId, [...(this.queues.get(roomId) || []), text]);
      return ok({ queued: true });
    }
    this.startDrive(room, text);
    return ok({ queued: false });
  }

  /**
   * Holds every member. The member already replying finishes; queued messages are dropped.
   * @param {string} roomId
   */
  stop(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return err(ErrorCodes.BOT_ROOM_NOT_FOUND_009, `Room '${roomId}' not found`);
    this.queues.delete(roomId);
    this.update(room, {
      held: [...room.memberIds],
      status: room.status === 'running' ? 'running' : 'stopped',
    });
    return ok(this.snapshot(room));
  }

  /**
   * @param {string} roomId
   * @returns {Promise<void>}
   */
  whenIdle(roomId) {
    return this.drives.get(roomId) || Promise.resolve();
  }

  /**
   * @param {GroupRoom} room
   * @param {string} text
   */
  startDrive(room, text) {
    this.update(room, { status: 'running' });
    const drive = this.drive(room, text).finally(() => {
      this.drives.delete(room.id);
    });
    this.drives.set(room.id, drive);
  }

  /**
   * @param {GroupRoom} room
   * @param {string} firstText
   */
  async drive(room, firstText) {
    /** @type {string | undefined} */
    let text = firstText;
    while (text !== undefined) {
      const targets = this.addressees(room, text);
      this.append(room, { speaker: 'user', text });
      for (const memberId of targets) {
        if (room.held.includes(memberId)) continue;
        await this.driveMember(room, memberId);
      }
      const queue = this.queues.get(room.id) || [];
      text = queue.shift();
      this.queues.set(room.id, queue);
    }
    this.update(room, { status: room.held.length === room.memberIds.length ? 'stopped' : 'idle' });
  }

  /**
   * Works out who a message addresses and applies the release rules.
   * @param {GroupRoom} room
   * @param {string} text
   * @returns {string[]}
   */
  addressees(room, text) {
    const mentions = parseMentions(text);
    if (mentions.some((m) => RELEASE_ALL.has(m))) {
      this.update(room, { held: [] });
      return [...room.memberIds];
    }
    /** @type {string[]} */
    const mentioned = [];
    for (const handle of mentions) {
      const res = this.roster.resolveMention(handle);
      if (res.success && room.memberIds.includes(res.data.id)) mentioned.push(res.data.id);
    }
    if (mentioned.length > 0) {
      this.update(room, { held: room.held.filter((id) => !mentioned.includes(id)) });
      return room.memberIds.filter((id) => mentioned.includes(id));
    }
    return room.memberIds.filter((id) => !room.held.includes(id));
  }

  /**
   * @param {GroupRoom} room
   * @param {string} memberId
   */
  async driveMember(room, memberId) {
    const botRes = this.roster.getAgent(memberId);
    if (!botRes.success) {
      this.append(room, { speaker: memberId, text: 'Left the roster', error: true });
      return;
    }
    const bot = /** @type {import('./bot-roster').Bot} */ (botRes.data);
    const prompt = buildMemberPrompt(room.strategy, bot, room, (id) => this.nameOf(id));
    this.emit('room:turn', { roomId: room.id, memberId, status: 'started' });
    let reply;
    try {
      reply = await this.deliver(bot, prompt, { chainId: room.id, hops: 1, from: null });
    } catch (e) {
      reply = err(ErrorCodes.TASK_EXECUTION_FAILED_007, e instanceof Error ? e.message : String(e));
    }
    if (reply.success) {
      this.append(room, { speaker: memberId, text: reply.data.text });
    } else {
      this.append(room, { speaker: memberId, text: reply.message, error: true });
    }
    this.emit('room:turn', { roomId: room.id, memberId, status: 'settled' });
  }

  /** @param {string} id */
  nameOf(id) {
    const res = this.roster.getAgent(id);
    if (!res.success) return id;
    const bot = /** @type {import('./bot-roster').Bot} */ (res.data);
    return `${bot.displayName || bot.name} (@${bot.handle})`;
  }

  /**
   * @param {GroupRoom} room
   * @param {Omit<RoomLogEntry, 'at'>} entry
   */
  append(room, entry) {
    const full = { ...entry, at: new Date().toISOString() };
    this.update(room, { log: [...room.log, full].slice(-MAX_LOG_ENTRIES) });
    this.emit('room:message', { roomId: room.id, entry: full });
  }

  /**
   * Replaces the room's fields with new values (never mutates nested arrays in place).
   * @param {GroupRoom} room
   * @param {Partial<GroupRoom>} changes
   */
  update(room, changes) {
    const statusChanged = changes.status !== undefined && changes.status !== room.status;
    Object.assign(room, changes);
    if (statusChanged) this.emit('room:status', { roomId: room.id, status: room.status });
    this.persist();
  }

  /**
   * @param {string} type
   * @param {unknown} data
   */
  emit(type, data) {
    try {
      this.onEvent?.(type, data);
    } catch {}
  }

  /** @param {GroupRoom} room */
  snapshot(room) {
    return { ...room, memberIds: [...room.memberIds], held: [...room.held], log: [...room.log] };
  }

  persist() {
    if (!this.storagePath) return;
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      const tmp = `${this.storagePath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: 1, rooms: this.list() }, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (e) {
      console.warn('[GroupRoomManager] Failed to save rooms:', e instanceof Error ? e.message : e);
    }
  }

  /**
   * Restores rooms. A drive cannot survive a restart, so every room comes back idle.
   * @param {string | null} [customPath]
   */
  loadFromDisk(customPath = this.storagePath) {
    if (!customPath || !fs.existsSync(customPath)) return ok({ loaded: false, count: 0 });
    try {
      const parsed = JSON.parse(fs.readFileSync(customPath, 'utf8'));
      if (!parsed || !Array.isArray(parsed.rooms)) throw new Error('missing rooms array');
      for (const raw of parsed.rooms) {
        if (!raw || typeof raw.id !== 'string' || !Array.isArray(raw.memberIds)) continue;
        this.rooms.set(raw.id, {
          ...raw,
          status: raw.held?.length === raw.memberIds.length ? 'stopped' : 'idle',
          held: Array.isArray(raw.held) ? raw.held : [],
          log: Array.isArray(raw.log) ? raw.log.slice(-MAX_LOG_ENTRIES) : [],
        });
      }
      return ok({ loaded: true, count: this.rooms.size });
    } catch (e) {
      return err(
        ErrorCodes.BOT_STORAGE_LOAD_FAILED_004,
        `rooms.json is unreadable: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

module.exports = {
  DEFAULT_ROOMS_PATH,
  GroupRoomManager,
  buildMemberPrompt,
};
