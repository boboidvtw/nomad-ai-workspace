/**
 * Nomad Shared Core - Bot HTTP routes (SPEC-AGENT-BOTS)
 * One handler shared by the Studio bridge and the daemon so both expose identical /api/bots/*.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { routineLabel } = require('../tasks/recurring-scheduler');

/** @type {Record<string, number>} */
const STATUS_BY_CODE = {
  [ErrorCodes.ROSTER_AGENT_NOT_FOUND_001]: 404,
  [ErrorCodes.BOT_ROOM_NOT_FOUND_009]: 404,
  [ErrorCodes.BOT_HANDLE_CONFLICT_001]: 409,
  [ErrorCodes.BOT_HAS_ACTIVE_TASKS_002]: 409,
  [ErrorCodes.BOT_ROOM_BUSY_012]: 409,
  [ErrorCodes.BOT_LOOP_GUARD_TRIPPED_007]: 429,
  [ErrorCodes.BOT_STORAGE_SAVE_FAILED_003]: 500,
  [ErrorCodes.BOT_HERDR_UNAVAILABLE_010]: 503,
};

/**
 * @typedef {Object} BotServices
 * @property {import('./bot-roster').BotRoster} roster
 * @property {import('./message-router').BotMessageRouter | null} [router] - M5 mention/message router
 * @property {{ create: Function, list: Function, get: Function, post: Function, stop: Function } | null} [rooms] - M6 group rooms
 * @property {import('../tasks/recurring-scheduler').RecurringScheduler | null} [scheduler] - M4 routines
 *
 * @typedef {Object} BotRequest
 * @property {string} method
 * @property {string} pathname
 * @property {URLSearchParams} searchParams
 * @property {() => Promise<any>} readBody
 * @property {BotServices} services
 *
 * @typedef {{ status: number, payload: any }} BotResponse
 */

/**
 * @param {any} result
 * @returns {BotResponse}
 */
function respond(result) {
  if (result && result.success) return { status: 200, payload: result };
  return { status: STATUS_BY_CODE[result?.errorCode] || 400, payload: result };
}

/**
 * @param {string} segment
 * @returns {string | null}
 */
function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * @param {BotRequest} req
 * @returns {Promise<BotResponse | null>} null when the path is not a bot route
 */
async function handleBotRequest(req) {
  const { method, pathname, searchParams, readBody, services } = req;
  if (pathname !== '/api/bots' && !pathname.startsWith('/api/bots/')) return null;
  const { roster } = services;
  const parts = pathname.split('/').slice(3); // ['', 'api', 'bots', ...rest]

  if (parts.length === 0) {
    if (method === 'GET') return respond(ok(roster.listBots()));
    if (method === 'POST') return respond(roster.registerAgent(await readBody()));
    return null;
  }

  const [head, action] = parts;
  if (head === 'resolve' && method === 'GET') {
    return respond(roster.resolveMention(searchParams.get('mention') || ''));
  }
  if (head === 'sync' && parts.length === 1) {
    if (method === 'GET') return respond(ok(roster.toSyncPayload()));
    if (method === 'POST') return respond(roster.applySyncPayload(await readBody()));
    return null;
  }
  if (head === 'mentions' && method === 'POST') {
    if (!services.router) return unavailable('Bot messaging');
    const body = (await readBody()) || {};
    return respond(await services.router.dispatchMentions(String(body.text || '')));
  }
  if (head === 'messages' && method === 'POST') {
    if (!services.router) return unavailable('Bot messaging');
    return respond(await services.router.send(await readBody()));
  }
  if (head === 'rooms') {
    return handleRoomRequest(method, parts.slice(1), readBody, services);
  }

  const id = decodeSegment(head);
  if (id === null) {
    return respond(err(ErrorCodes.ROSTER_INVALID_PROFILE_002, 'Bot id is not valid URL encoding'));
  }
  if (parts.length === 1) {
    if (method === 'GET') return respond(roster.getAgent(id));
    if (method === 'PATCH') return respond(roster.updateBot(id, await readBody()));
    if (method === 'DELETE') return respond(roster.removeBot(id));
    return null;
  }
  if (action === 'seen' && method === 'POST') return respond(roster.markSeen(id));
  if (action === 'routines' && method === 'GET') {
    if (!services.scheduler) return unavailable('Routines');
    const bot = roster.getAgent(id);
    if (!bot.success) return respond(bot);
    const routines = services.scheduler
      .listSchedules({ assignee: id })
      .map((schedule) => ({ ...schedule, label: routineLabel(schedule, roster) }));
    return respond(ok(routines));
  }
  return null;
}

/**
 * @param {string} feature
 * @returns {BotResponse}
 */
function unavailable(feature) {
  return {
    status: 503,
    payload: err(ErrorCodes.TASK_EXECUTION_FAILED_007, `${feature} is not available here`),
  };
}

/**
 * @param {string} method
 * @param {string[]} parts - path segments after /api/bots/rooms
 * @param {() => Promise<any>} readBody
 * @param {BotServices} services
 * @returns {Promise<BotResponse | null>}
 */
async function handleRoomRequest(method, parts, readBody, services) {
  const rooms = services.rooms;
  if (!rooms) return unavailable('Group rooms');
  if (parts.length === 0) {
    if (method === 'GET') return respond(ok(rooms.list()));
    if (method === 'POST') return respond(rooms.create(await readBody()));
    return null;
  }
  const roomId = decodeSegment(parts[0]);
  if (roomId === null) {
    return respond(err(ErrorCodes.BOT_ROOM_NOT_FOUND_009, 'Room id is not valid URL encoding'));
  }
  if (parts.length === 1 && method === 'GET') return respond(rooms.get(roomId));
  if (parts[1] === 'messages' && method === 'POST') {
    return respond(await rooms.post(roomId, await readBody()));
  }
  if (parts[1] === 'stop' && method === 'POST') return respond(rooms.stop(roomId));
  return null;
}

module.exports = {
  handleBotRequest,
};
