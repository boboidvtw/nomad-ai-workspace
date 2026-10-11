/**
 * Nomad Shared Core - Bot Roster (SPEC-AGENT-BOTS M1)
 * A Bot is a roster agent with an identity: handle, persona, avatar, and a canonical chat.
 * Bot fields are optional extras on the Agent record, so the dispatcher keeps working unchanged.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { AgentRoster, DEFAULT_ROSTER, AGENT_STATUS } = require('../tasks/roster');
const { isConversationUrl, normalizeChatUrl, CONVERSATION_PATTERNS } = require('./chat-urls');

const BOT_STATE = Object.freeze({
  IDLE: 'idle',
  WORKING: 'working',
  BLOCKED: 'blocked',
  DONE: 'done',
  UNKNOWN: 'unknown',
});

const ROSTER_FILE_VERSION = 1;
const DEFAULT_ROSTER_PATH = path.join(os.homedir(), '.nomad', 'roster.json');
const MAX_HANDLE_LENGTH = 32;
const MAX_TIMELINE_ENTRIES = 50;

/** Fields a caller may change through updateBot / sync. Runtime fields are never accepted. */
const EDITABLE_FIELDS = Object.freeze([
  'name',
  'displayName',
  'role',
  'platform',
  'skills',
  'persona',
  'avatar',
  'sections',
  'hidden',
  'maxConcurrency',
  'budgetTokenLimit',
]);

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
function toBotHandle(name) {
  const slug = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  if (!slug) return '';
  const prefixed = /^[a-z]/.test(slug) ? slug : `bot-${slug}`;
  return prefixed.slice(0, MAX_HANDLE_LENGTH).replace(/[-_]+$/, '');
}

/**
 * @param {string} value
 * @returns {string}
 */
function compact(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * @param {{ id: string, name?: string, displayName?: string }} agent
 * @returns {string}
 */
function defaultHandle(agent) {
  return (
    toBotHandle(agent.displayName || '') ||
    toBotHandle(String(agent.id).replace(/^(agent|bot)-/, '')) ||
    toBotHandle(agent.name || '') ||
    'bot'
  );
}

/**
 * Picks the editable fields out of an untrusted patch.
 * @param {Record<string, unknown>} patch
 * @returns {Record<string, unknown>}
 */
function pickEditable(patch) {
  /** @type {Record<string, unknown>} */
  const picked = {};
  for (const key of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) picked[key] = patch[key];
  }
  if (picked.skills !== undefined && !Array.isArray(picked.skills)) delete picked.skills;
  if (picked.sections !== undefined && !Array.isArray(picked.sections)) delete picked.sections;
  if (picked.hidden !== undefined) picked.hidden = picked.hidden === true;
  return picked;
}

/**
 * @param {import('../tasks/roster').Agent & Partial<BotFields>} agent
 * @returns {Bot}
 */
function withBotDefaults(agent) {
  return {
    ...agent,
    handle: agent.handle || defaultHandle(agent),
    canonicalChat: agent.canonicalChat || null,
    sections: Array.isArray(agent.sections) ? [...agent.sections] : [],
    hidden: agent.hidden === true,
    state: agent.state || BOT_STATE.IDLE,
    lastSeenAt: agent.lastSeenAt || null,
    stateChangedAt: agent.stateChangedAt || null,
    timeline: Array.isArray(agent.timeline) ? agent.timeline.slice(-MAX_TIMELINE_ENTRIES) : [],
  };
}

/**
 * Strips runtime-only fields before writing to disk.
 * @param {Bot} bot
 */
function toStoredBot(bot) {
  const { status: _status, currentTaskIds: _tasks, state: _state, ...stored } = bot;
  return stored;
}

class BotRoster extends AgentRoster {
  /**
   * @param {Object} [options]
   * @param {string} [options.storagePath] - roster.json path; enables auto-persist when set
   * @param {boolean} [options.autoPersist]
   * @param {import('../tasks/roster').Agent[]} [options.seed]
   */
  constructor(options = {}) {
    super(options.seed || DEFAULT_ROSTER);
    this.storagePath = options.storagePath || null;
    this.autoPersist =
      options.autoPersist !== undefined ? Boolean(options.autoPersist) : Boolean(this.storagePath);
    for (const [id, agent] of this.agents) {
      this.agents.set(id, withBotDefaults(agent));
    }
  }

  /**
   * Legacy registration path. Keeps existing bot fields so the old API cannot wipe a persona.
   * @param {Partial<Bot>} profile
   */
  registerAgent(profile) {
    const existing = profile && profile.id ? this.agents.get(String(profile.id).trim()) : null;
    const res = super.registerAgent(profile);
    if (!res.success) return res;
    const merged = withBotDefaults({
      ...existing,
      ...res.data,
      ...pickEditable(/** @type {Record<string, unknown>} */ (profile)),
      handle: existing ? /** @type {Bot} */ (existing).handle : undefined,
    });
    if (!existing) merged.handle = this.uniqueHandle(merged.handle, merged.id);
    this.agents.set(merged.id, merged);
    this.persist();
    return ok({ ...merged });
  }

  /**
   * Appends -2, -3, ... until no other bot uses the handle.
   * @param {string} base
   * @param {string} selfId
   * @returns {string}
   */
  uniqueHandle(base, selfId) {
    let candidate = base;
    for (let n = 2; ; n++) {
      const owner = this.findByHandle(candidate);
      if (!owner || owner.id === selfId) return candidate;
      candidate = `${base.slice(0, MAX_HANDLE_LENGTH - String(n).length - 1)}-${n}`;
    }
  }

  /**
   * @param {string} handle
   * @returns {Bot | null}
   */
  findByHandle(handle) {
    for (const agent of this.agents.values()) {
      if (/** @type {Bot} */ (agent).handle === handle) return /** @type {Bot} */ (agent);
    }
    return null;
  }

  /**
   * Applies an editable patch and returns the new bot. Never mutates the stored object.
   * @param {string} id
   * @param {Record<string, unknown>} patch
   * @returns {import('../result').UnitResult<Bot>}
   */
  updateBot(id, patch) {
    const current = /** @type {Bot | undefined} */ (this.agents.get(id));
    if (!current) {
      return err(ErrorCodes.ROSTER_AGENT_NOT_FOUND_001, `Bot '${id}' not found`);
    }
    if (!patch || typeof patch !== 'object') {
      return err(ErrorCodes.ROSTER_INVALID_PROFILE_002, 'Bot patch must be an object');
    }
    const changes = pickEditable(patch);
    const next = { ...current, ...changes };
    if (Object.prototype.hasOwnProperty.call(changes, 'displayName')) {
      const handle = toBotHandle(String(changes.displayName || '')) || defaultHandle(next);
      const owner = this.findByHandle(handle);
      if (owner && owner.id !== id) {
        return err(
          ErrorCodes.BOT_HANDLE_CONFLICT_001,
          `Handle @${handle} is already used by ${owner.id}`,
        );
      }
      next.handle = handle;
    }
    this.agents.set(id, next);
    this.persist();
    return ok({ ...next });
  }

  /**
   * @param {string} id
   * @returns {import('../result').UnitResult<{ removed: string }>}
   */
  removeBot(id) {
    const current = this.agents.get(id);
    if (!current) {
      return err(ErrorCodes.ROSTER_AGENT_NOT_FOUND_001, `Bot '${id}' not found`);
    }
    if (current.currentTaskIds.length > 0) {
      return err(
        ErrorCodes.BOT_HAS_ACTIVE_TASKS_002,
        `Bot '${id}' still holds ${current.currentTaskIds.length} task(s)`,
      );
    }
    this.agents.delete(id);
    this.persist();
    return ok({ removed: id });
  }

  /**
   * Resolves `@handle`, an id, or a compacted old name to a bot.
   * @param {string} mention
   * @returns {import('../result').UnitResult<Bot>}
   */
  resolveMention(mention) {
    const raw = String(mention || '')
      .trim()
      .replace(/^@/, '');
    const handle = raw.toLowerCase();
    const squashed = compact(raw);
    for (const agent of this.agents.values()) {
      const bot = /** @type {Bot} */ (agent);
      if (
        bot.handle === handle ||
        bot.id === raw ||
        (squashed &&
          (compact(bot.handle) === squashed ||
            compact(bot.name) === squashed ||
            compact(bot.displayName || '') === squashed))
      ) {
        return ok({ ...bot });
      }
    }
    return err(ErrorCodes.ROSTER_AGENT_NOT_FOUND_001, `No bot answers to @${raw}`);
  }

  /**
   * @param {string} id
   * @param {{ platform: string, url: string | null, herdrAgentName?: string | null }} chat
   */
  bindCanonicalChat(id, chat) {
    const platform = chat.platform;
    if (chat.url && CONVERSATION_PATTERNS[platform] && !isConversationUrl(platform, chat.url)) {
      return err(
        ErrorCodes.ROSTER_INVALID_PROFILE_002,
        `Refusing to bind ${id} to a URL that is not a ${platform} conversation`,
      );
    }
    if (chat.url && !CONVERSATION_PATTERNS[platform]) {
      return err(ErrorCodes.ROSTER_INVALID_PROFILE_002, `Platform ${platform} has no chat URLs`);
    }
    return this.replaceBot(id, (bot) => ({
      canonicalChat: {
        platform: chat.platform || bot.platform,
        url: chat.url ? normalizeChatUrl(chat.url) : null,
        herdrAgentName: chat.herdrAgentName || null,
        boundAt: new Date().toISOString(),
      },
    }));
  }

  /**
   * @param {string} id
   * @param {BotState} state
   */
  setBotState(id, state) {
    if (!(/** @type {string[]} */ (Object.values(BOT_STATE)).includes(state))) {
      return err(ErrorCodes.ROSTER_INVALID_PROFILE_002, `Invalid bot state: '${state}'`);
    }
    return this.replaceBot(id, () => ({ state, stateChangedAt: new Date().toISOString() }), false);
  }

  /**
   * Marks a bot's latest reply as seen; a `done` bot becomes `idle`.
   * @param {string} id
   */
  markSeen(id) {
    return this.replaceBot(
      id,
      (bot) => ({
        lastSeenAt: new Date().toISOString(),
        state: bot.state === BOT_STATE.DONE ? BOT_STATE.IDLE : bot.state,
      }),
      false,
    );
  }

  /**
   * @param {string} id
   * @param {Omit<BotTimelineEntry, 'at'>} entry
   */
  appendTimeline(id, entry) {
    return this.replaceBot(id, (bot) => ({
      timeline: [...bot.timeline, { ...entry, at: new Date().toISOString() }].slice(
        -MAX_TIMELINE_ENTRIES,
      ),
    }));
  }

  /**
   * @param {string} id
   * @param {(bot: Bot) => Partial<Bot>} change
   * @param {boolean} [persist=true]
   * @returns {import('../result').UnitResult<Bot>}
   */
  replaceBot(id, change, persist = true) {
    const current = /** @type {Bot | undefined} */ (this.agents.get(id));
    if (!current) {
      return err(ErrorCodes.ROSTER_AGENT_NOT_FOUND_001, `Bot '${id}' not found`);
    }
    const next = { ...current, ...change(current) };
    this.agents.set(id, next);
    if (persist) this.persist();
    return ok({ ...next });
  }

  /** @returns {Bot[]} */
  listBots() {
    return /** @type {Bot[]} */ (this.listAgents());
  }

  /**
   * Payload for Google Drive `Shared/`: persona and settings only. Chat URLs are tied to
   * the signed-in browser account, and runtime state belongs to this machine.
   */
  toSyncPayload() {
    return {
      version: ROSTER_FILE_VERSION,
      bots: this.listBots().map((bot) => {
        const {
          canonicalChat: _chat,
          timeline: _timeline,
          lastSeenAt: _seen,
          stateChangedAt: _changed,
          ...rest
        } = toStoredBot(bot);
        return rest;
      }),
    };
  }

  /**
   * Merges bots from a Drive payload. Local chat bindings, timelines and runtime state win.
   * @param {{ version?: number, bots?: unknown[] }} payload
   * @returns {import('../result').UnitResult<{ merged: number }>}
   */
  applySyncPayload(payload) {
    if (!payload || !Array.isArray(payload.bots)) {
      return err(ErrorCodes.BOT_STORAGE_LOAD_FAILED_004, 'Sync payload has no bots array');
    }
    let merged = 0;
    for (const raw of payload.bots) {
      const incoming = /** @type {Record<string, any>} */ (raw);
      if (!incoming || typeof incoming.id !== 'string') continue;
      if (this.agents.has(incoming.id)) {
        const res = this.updateBot(incoming.id, incoming);
        if (res.success) merged++;
      } else if (this.registerAgent(incoming).success) {
        merged++;
      }
    }
    this.persist();
    return ok({ merged });
  }

  persist() {
    if (this.autoPersist && this.storagePath) {
      this.saveToDiskSync();
    }
  }

  /**
   * @param {string | null} [customPath]
   * @returns {import('../result').UnitResult<{ persisted: boolean, path?: string, count: number }>}
   */
  saveToDiskSync(customPath = this.storagePath) {
    if (!customPath) return ok({ persisted: false, count: 0 });
    try {
      fs.mkdirSync(path.dirname(customPath), { recursive: true });
      const bots = this.listBots().map(toStoredBot);
      const data = JSON.stringify({ version: ROSTER_FILE_VERSION, bots }, null, 2);
      const tmpPath = `${customPath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
      fs.writeFileSync(tmpPath, data, 'utf8');
      fs.renameSync(tmpPath, customPath);
      return ok({ persisted: true, path: customPath, count: bots.length });
    } catch (e) {
      return err(
        ErrorCodes.BOT_STORAGE_SAVE_FAILED_003,
        `Failed to save roster: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  /** @param {string | null} [customPath] */
  async saveToDisk(customPath = this.storagePath) {
    return this.saveToDiskSync(customPath);
  }

  /**
   * Loads roster.json. A corrupt file is renamed to `.corrupt-<ts>` and the seed roster stays.
   * @param {string | null} [customPath]
   * @param {{ quarantine?: boolean }} [options] - read-only callers (the daemon) pass false
   * @returns {import('../result').UnitResult<{ loaded: boolean, count: number }>}
   */
  loadFromDisk(customPath = this.storagePath, options = {}) {
    if (!customPath || !fs.existsSync(customPath)) {
      return ok({ loaded: false, count: 0 });
    }
    /** @type {any} */
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(customPath, 'utf8'));
      if (!parsed || !Array.isArray(parsed.bots)) throw new Error('missing bots array');
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      if (options.quarantine === false) {
        return err(ErrorCodes.BOT_STORAGE_LOAD_FAILED_004, `roster.json is unreadable (${reason})`);
      }
      const quarantine = `${customPath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(customPath, quarantine);
      } catch {}
      return err(
        ErrorCodes.BOT_STORAGE_LOAD_FAILED_004,
        `roster.json is unreadable (${reason}); moved to ${quarantine}`,
      );
    }
    const restored = new Map();
    for (const stored of parsed.bots) {
      if (!stored || typeof stored.id !== 'string' || typeof stored.name !== 'string') continue;
      restored.set(
        stored.id,
        withBotDefaults({ ...stored, status: AGENT_STATUS.IDLE, currentTaskIds: [] }),
      );
    }
    this.agents = restored;
    return ok({ loaded: true, count: restored.size });
  }
}

module.exports = {
  BOT_STATE,
  DEFAULT_ROSTER_PATH,
  MAX_TIMELINE_ENTRIES,
  BotRoster,
  toBotHandle,
};
