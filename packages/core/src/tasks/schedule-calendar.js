/**
 * Nomad Shared Core - Schedule calendar
 * Projects recurring schedules onto calendar days and counts the runs they already made, so the
 * Dashboard can show "what runs when" without simulating the scheduler loop.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

const MINUTE_MS = 60000;
const DAY_MS = 24 * 60 * MINUTE_MS;
/** Longest range one request may cover: two months of month-view navigation. */
const MAX_RANGE_DAYS = 62;
/** Per-schedule ceiling on projected occurrences (a 1s interval over 62 days is 5.3M). */
const DEFAULT_MAX_OCCURRENCES = 100000;
const MAX_TASK_IDS_PER_ITEM = 20;

/**
 * @typedef {Object} CalendarPlannedItem
 * @property {'planned'} kind
 * @property {string} scheduleId
 * @property {string} title
 * @property {string | null} assignee
 * @property {number} count
 * @property {string} firstAt
 *
 * @typedef {Object} CalendarRunItem
 * @property {'run'} kind
 * @property {string} scheduleId
 * @property {string} title
 * @property {number} count
 * @property {Record<string, number>} statuses
 * @property {string} firstAt
 * @property {string[]} taskIds
 *
 * @typedef {{ kind: string, at: string, title: string } & Record<string, unknown>} CalendarExtra
 * @typedef {CalendarPlannedItem | CalendarRunItem | (CalendarExtra & { firstAt: string })} CalendarItem
 *
 * @typedef {Object} CalendarDay
 * @property {string} date - YYYY-MM-DD in the viewer's time zone
 * @property {CalendarItem[]} items
 *
 * @typedef {Object} ScheduleCalendar
 * @property {string} from
 * @property {string} to
 * @property {number} tzOffsetMinutes
 * @property {string | null} timeZone
 * @property {CalendarDay[]} days
 * @property {string[]} truncated - schedules whose projection hit the occurrence cap
 *
 * @typedef {Object} CalendarTaskLike
 * @property {string} id
 * @property {string} status
 * @property {string} createdAt
 * @property {Record<string, unknown>} [metadata]
 *
 * @typedef {Object} CalendarInput
 * @property {import('./recurring-scheduler').Schedule[]} schedules
 * @property {CalendarTaskLike[]} [tasks]
 * @property {CalendarExtra[]} [extras]
 * @property {string} from - ISO time, inclusive
 * @property {string} to - ISO time, exclusive
 * @property {number} [tzOffsetMinutes] - Date#getTimezoneOffset() of the viewer (Taipei: -480)
 * @property {string} [timeZone] - IANA zone of the viewer; wins over tzOffsetMinutes and follows DST
 * @property {string | number} [now]
 * @property {number} [maxOccurrences]
 */

const MAX_OFFSET_MINUTES = 24 * 60;

/**
 * Builds the function that names the viewer's calendar day for an instant.
 * @param {{ timeZone?: string, tzOffsetMinutes?: number }} input
 * @returns {import('../result').UnitResult<(ms: number) => string>}
 */
function dayKeyFor(input) {
  if (input.timeZone) {
    try {
      // en-CA formats dates as YYYY-MM-DD.
      const format = new Intl.DateTimeFormat('en-CA', {
        timeZone: input.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return ok((/** @type {number} */ ms) => format.format(ms));
    } catch {
      return err(
        ErrorCodes.TASK_CALENDAR_RANGE_INVALID_014,
        `Unknown time zone "${input.timeZone}"`,
      );
    }
  }
  const offset = input.tzOffsetMinutes === undefined ? 0 : Number(input.tzOffsetMinutes);
  if (!Number.isFinite(offset) || Math.abs(offset) > MAX_OFFSET_MINUTES) {
    return err(ErrorCodes.TASK_CALENDAR_RANGE_INVALID_014, 'tz must be minutes within one day');
  }
  return ok((/** @type {number} */ ms) =>
    new Date(ms - offset * MINUTE_MS).toISOString().slice(0, 10),
  );
}

/**
 * @param {string} from
 * @param {string} to
 * @returns {import('../result').UnitResult<{ fromMs: number, toMs: number }>}
 */
function parseRange(from, to) {
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return err(ErrorCodes.TASK_CALENDAR_RANGE_INVALID_014, 'from and to must be ISO dates');
  }
  if (toMs <= fromMs) {
    return err(ErrorCodes.TASK_CALENDAR_RANGE_INVALID_014, 'to must be later than from');
  }
  if (toMs - fromMs > MAX_RANGE_DAYS * DAY_MS) {
    return err(
      ErrorCodes.TASK_CALENDAR_RANGE_INVALID_014,
      `A calendar range may cover at most ${MAX_RANGE_DAYS} days`,
    );
  }
  return ok({ fromMs, toMs });
}

/**
 * The scheduler fires an overdue schedule on its next poll, then every intervalMs after that.
 * @param {import('./recurring-scheduler').Schedule} schedule
 * @param {{ fromMs: number, toMs: number, nowMs: number, dayOf: (ms: number) => string, max: number }} window
 * @returns {{ items: Map<string, CalendarPlannedItem>, truncated: boolean }}
 */
function projectSchedule(schedule, window) {
  /** @type {Map<string, CalendarPlannedItem>} */
  const items = new Map();
  const interval = Number(schedule.intervalMs);
  const next = Date.parse(schedule.nextRunAt);
  if (!schedule.enabled || !(interval > 0) || Number.isNaN(next)) {
    return { items, truncated: false };
  }
  let t = Math.max(next, window.nowMs);
  if (t < window.fromMs) t += Math.ceil((window.fromMs - t) / interval) * interval;
  let count = 0;
  for (; t < window.toMs; t += interval) {
    if (count >= window.max) return { items, truncated: true };
    count += 1;
    const key = window.dayOf(t);
    const item = items.get(key);
    if (item) item.count += 1;
    else {
      items.set(key, {
        kind: 'planned',
        scheduleId: schedule.id,
        title: schedule.name,
        assignee: schedule.taskTemplate?.assignee || null,
        count: 1,
        firstAt: new Date(t).toISOString(),
      });
    }
  }
  return { items, truncated: false };
}

/**
 * @param {CalendarTaskLike[]} tasks
 * @param {Map<string, import('./recurring-scheduler').Schedule>} byId
 * @param {{ fromMs: number, toMs: number, dayOf: (ms: number) => string }} window
 * @returns {Array<[string, CalendarRunItem]>}
 */
function countRuns(tasks, byId, window) {
  /** @type {Map<string, CalendarRunItem & { day: string }>} */
  const runs = new Map();
  const sorted = [...tasks].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  for (const task of sorted) {
    const scheduleId = task.metadata?.triggeredByScheduleId;
    const at = Date.parse(task.createdAt);
    if (typeof scheduleId !== 'string' || Number.isNaN(at)) continue;
    if (at < window.fromMs || at >= window.toMs) continue;
    const day = window.dayOf(at);
    const key = `${day}|${scheduleId}`;
    const existing = runs.get(key);
    if (existing) {
      existing.count += 1;
      existing.statuses[task.status] = (existing.statuses[task.status] || 0) + 1;
      if (existing.taskIds.length < MAX_TASK_IDS_PER_ITEM) existing.taskIds.push(task.id);
      continue;
    }
    const scheduledName = task.metadata?.scheduledName;
    runs.set(key, {
      day,
      kind: 'run',
      scheduleId,
      title:
        byId.get(scheduleId)?.name ||
        (typeof scheduledName === 'string' ? scheduledName : scheduleId),
      count: 1,
      statuses: { [task.status]: 1 },
      firstAt: new Date(at).toISOString(),
      taskIds: [task.id],
    });
  }
  return [...runs.values()].map(({ day, ...item }) => [day, item]);
}

/**
 * @param {CalendarInput} input
 * @returns {import('../result').UnitResult<ScheduleCalendar>}
 */
function buildScheduleCalendar(input) {
  const range = parseRange(input.from, input.to);
  if (!range.success) return range;
  const { fromMs, toMs } = range.data;
  const dayKey = dayKeyFor(input);
  if (!dayKey.success) return dayKey;
  const dayOf = dayKey.data;
  const tz = Number(input.tzOffsetMinutes) || 0;
  const nowMs = input.now === undefined ? Date.now() : new Date(input.now).getTime();
  const max = input.maxOccurrences || DEFAULT_MAX_OCCURRENCES;
  const schedules = input.schedules || [];

  /** @type {Map<string, CalendarItem[]>} */
  const byDay = new Map();
  /** @param {string} day @param {CalendarItem} item */
  const add = (day, item) => byDay.set(day, [...(byDay.get(day) || []), item]);

  /** @type {string[]} */
  const truncated = [];
  for (const schedule of schedules) {
    const projection = projectSchedule(schedule, { fromMs, toMs, nowMs, dayOf, max });
    if (projection.truncated) truncated.push(schedule.id);
    for (const [day, item] of projection.items) add(day, item);
  }
  const byId = new Map(schedules.map((s) => [s.id, s]));
  for (const [day, item] of countRuns(input.tasks || [], byId, { fromMs, toMs, dayOf })) {
    add(day, item);
  }
  for (const extra of input.extras || []) {
    const at = Date.parse(extra.at);
    if (Number.isNaN(at) || at < fromMs || at >= toMs) continue;
    add(dayOf(at), { ...extra, firstAt: new Date(at).toISOString() });
  }

  const days = [...byDay.keys()].sort().map((date) => ({
    date,
    items: [.../** @type {CalendarItem[]} */ (byDay.get(date))].sort(
      (a, b) => Date.parse(a.firstAt) - Date.parse(b.firstAt),
    ),
  }));
  return ok({
    from: new Date(fromMs).toISOString(),
    to: new Date(toMs).toISOString(),
    tzOffsetMinutes: tz,
    timeZone: input.timeZone || null,
    days,
    truncated,
  });
}

/**
 * @typedef {Object} CalendarServices
 * @property {{ listSchedules: () => import('./recurring-scheduler').Schedule[] }} scheduler
 * @property {{ listTasks: (filter?: object) => CalendarTaskLike[] }} dispatcher
 * @property {{ calendarEntries: (from: string, to: string) => CalendarExtra[] } | null} [shipping]
 *
 * @typedef {Object} CalendarRequest
 * @property {string} method
 * @property {string} pathname
 * @property {URLSearchParams} searchParams
 * @property {CalendarServices} services
 */

/**
 * GET /api/calendar?from=<iso>&to=<iso>&tz=<getTimezoneOffset()>[&timeZone=<IANA zone>]
 * @param {CalendarRequest} req
 * @returns {Promise<{ status: number, payload: any } | null>} null when the path is not this route
 */
async function handleCalendarRequest(req) {
  if (req.pathname !== '/api/calendar') return null;
  if (req.method !== 'GET') {
    return {
      status: 405,
      payload: err(ErrorCodes.TASK_CALENDAR_RANGE_INVALID_014, 'Use GET /api/calendar'),
    };
  }
  const from = req.searchParams.get('from') || '';
  const to = req.searchParams.get('to') || '';
  const tz = Number(req.searchParams.get('tz') || 0);
  const timeZone = req.searchParams.get('timeZone') || undefined;
  const { scheduler, dispatcher, shipping } = req.services;
  const result = buildScheduleCalendar({
    schedules: scheduler.listSchedules(),
    tasks: dispatcher.listTasks(),
    extras: shipping ? shipping.calendarEntries(from, to) : [],
    from,
    to,
    tzOffsetMinutes: tz,
    timeZone,
  });
  return { status: result.success ? 200 : 400, payload: result };
}

module.exports = {
  MAX_RANGE_DAYS,
  buildScheduleCalendar,
  handleCalendarRequest,
};
