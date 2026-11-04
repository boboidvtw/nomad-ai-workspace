export type CalendarServices = {
    scheduler: {
        listSchedules: () => import("./recurring-scheduler").Schedule[];
    };
    dispatcher: {
        listTasks: (filter?: object) => CalendarTaskLike[];
    };
    shipping?: {
        calendarEntries: (from: string, to: string) => CalendarExtra[];
    } | null | undefined;
};
export type CalendarRequest = {
    method: string;
    pathname: string;
    searchParams: URLSearchParams;
    services: CalendarServices;
};
export type CalendarPlannedItem = {
    kind: "planned";
    scheduleId: string;
    title: string;
    assignee: string | null;
    count: number;
    firstAt: string;
};
export type CalendarRunItem = {
    kind: "run";
    scheduleId: string;
    title: string;
    count: number;
    statuses: Record<string, number>;
    firstAt: string;
    taskIds: string[];
};
export type CalendarExtra = {
    kind: string;
    at: string;
    title: string;
} & Record<string, unknown>;
export type CalendarItem = CalendarPlannedItem | CalendarRunItem | (CalendarExtra & {
    firstAt: string;
});
export type CalendarDay = {
    /**
     * - YYYY-MM-DD in the viewer's time zone
     */
    date: string;
    items: CalendarItem[];
};
export type ScheduleCalendar = {
    from: string;
    to: string;
    tzOffsetMinutes: number;
    timeZone: string | null;
    days: CalendarDay[];
    /**
     * - schedules whose projection hit the occurrence cap
     */
    truncated: string[];
};
export type CalendarTaskLike = {
    id: string;
    status: string;
    createdAt: string;
    metadata?: Record<string, unknown> | undefined;
};
export type CalendarInput = {
    schedules: import("./recurring-scheduler").Schedule[];
    tasks?: CalendarTaskLike[] | undefined;
    extras?: CalendarExtra[] | undefined;
    /**
     * - ISO time, inclusive
     */
    from: string;
    /**
     * - ISO time, exclusive
     */
    to: string;
    /**
     * - Date#getTimezoneOffset() of the viewer (Taipei: -480)
     */
    tzOffsetMinutes?: number | undefined;
    /**
     * - IANA zone of the viewer; wins over tzOffsetMinutes and follows DST
     */
    timeZone?: string | undefined;
    now?: string | number | undefined;
    maxOccurrences?: number | undefined;
};
/** Longest range one request may cover: two months of month-view navigation. */
export const MAX_RANGE_DAYS: 62;
/**
 * @param {CalendarInput} input
 * @returns {import('../result').UnitResult<ScheduleCalendar>}
 */
export function buildScheduleCalendar(input: CalendarInput): import("../result").UnitResult<ScheduleCalendar>;
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
export function handleCalendarRequest(req: CalendarRequest): Promise<{
    status: number;
    payload: any;
} | null>;
