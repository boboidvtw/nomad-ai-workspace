const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildScheduleCalendar, handleCalendarRequest, ErrorCodes } = require('../../index');

const HOUR = 3600000;

/**
 * @param {Partial<import('../tasks/recurring-scheduler').Schedule>} overrides
 * @returns {import('../tasks/recurring-scheduler').Schedule}
 */
function schedule(overrides) {
  return {
    id: 'schedule-a',
    name: 'Health check',
    intervalMs: 6 * HOUR,
    taskTemplate: { title: 'Check', assignee: 'agent-local' },
    enabled: true,
    autoRun: true,
    runCount: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    nextRunAt: '2026-11-05T01:00:00.000Z',
    ...overrides,
  };
}

/** @param {any} res */
function days(res) {
  assert.strictEqual(res.success, true, res.message);
  return Object.fromEntries(res.data.days.map((d) => [d.date, d.items]));
}

describe('Schedule calendar', () => {
  it('projects planned runs onto UTC days', () => {
    const res = buildScheduleCalendar({
      schedules: [schedule({})],
      from: '2026-11-05T00:00:00.000Z',
      to: '2026-11-07T00:00:00.000Z',
      now: '2026-11-04T00:00:00.000Z',
    });
    const byDay = days(res);
    assert.deepStrictEqual(Object.keys(byDay), ['2026-11-05', '2026-11-06']);
    assert.deepStrictEqual(byDay['2026-11-05'], [
      {
        kind: 'planned',
        scheduleId: 'schedule-a',
        title: 'Health check',
        assignee: 'agent-local',
        count: 4,
        firstAt: '2026-11-05T01:00:00.000Z',
      },
    ]);
    assert.strictEqual(byDay['2026-11-06'][0].count, 4);
    assert.deepStrictEqual(res.data.truncated, []);
  });

  it('buckets runs by the viewer local day (Taipei, UTC+8)', () => {
    const byDay = days(
      buildScheduleCalendar({
        schedules: [
          schedule({}),
          schedule({
            id: 'schedule-b',
            name: 'Nightly',
            intervalMs: 24 * HOUR,
            nextRunAt: '2026-11-05T17:00:00.000Z',
          }),
        ],
        from: '2026-11-04T16:00:00.000Z',
        to: '2026-11-06T16:00:00.000Z',
        tzOffsetMinutes: -480,
        now: '2026-11-04T00:00:00.000Z',
      }),
    );
    // 01:00Z, 07:00Z, 13:00Z on 11-05 are 09:00, 15:00, 21:00 local; 19:00Z is 03:00 on 11-06.
    const nov5 = byDay['2026-11-05'].find((i) => i.scheduleId === 'schedule-a');
    assert.strictEqual(nov5.count, 3);
    const nightly = byDay['2026-11-06'].find((i) => i.scheduleId === 'schedule-b');
    assert.strictEqual(nightly.count, 1, '17:00Z on 11-05 is 01:00 on 11-06 in Taipei');
    assert.strictEqual(nightly.firstAt, '2026-11-05T17:00:00.000Z');
  });

  it('leaves disabled schedules out of the plan', () => {
    const res = buildScheduleCalendar({
      schedules: [schedule({ enabled: false })],
      from: '2026-11-05T00:00:00.000Z',
      to: '2026-11-06T00:00:00.000Z',
      now: '2026-11-04T00:00:00.000Z',
    });
    assert.deepStrictEqual(days(res), {});
  });

  it('starts an overdue schedule at now, the next poll that will fire it', () => {
    const byDay = days(
      buildScheduleCalendar({
        schedules: [schedule({ nextRunAt: '2026-11-01T00:00:00.000Z' })],
        from: '2026-11-05T00:00:00.000Z',
        to: '2026-11-06T00:00:00.000Z',
        now: '2026-11-05T10:00:00.000Z',
      }),
    );
    assert.strictEqual(byDay['2026-11-05'][0].firstAt, '2026-11-05T10:00:00.000Z');
    assert.strictEqual(byDay['2026-11-05'][0].count, 3, '10:00, 16:00, 22:00');
  });

  it('counts past runs from the tasks a schedule created, by status', () => {
    const byDay = days(
      buildScheduleCalendar({
        schedules: [schedule({ enabled: false })],
        tasks: [
          {
            id: 't1',
            status: 'completed',
            createdAt: '2026-11-05T01:00:00.000Z',
            metadata: { triggeredByScheduleId: 'schedule-a', scheduledName: 'Health check' },
          },
          {
            id: 't2',
            status: 'failed',
            createdAt: '2026-11-05T07:00:00.000Z',
            metadata: { triggeredByScheduleId: 'schedule-a', scheduledName: 'Health check' },
          },
          {
            id: 't3',
            status: 'completed',
            createdAt: '2026-11-05T09:00:00.000Z',
            metadata: { triggeredByScheduleId: 'schedule-gone', scheduledName: 'Old job' },
          },
          { id: 't4', status: 'completed', createdAt: '2026-11-05T09:00:00.000Z', metadata: {} },
          {
            id: 't5',
            status: 'completed',
            createdAt: '2026-11-09T09:00:00.000Z',
            metadata: { triggeredByScheduleId: 'schedule-a' },
          },
        ],
        from: '2026-11-05T00:00:00.000Z',
        to: '2026-11-06T00:00:00.000Z',
        now: '2026-11-06T00:00:00.000Z',
      }),
    );
    assert.deepStrictEqual(byDay['2026-11-05'], [
      {
        kind: 'run',
        scheduleId: 'schedule-a',
        title: 'Health check',
        count: 2,
        statuses: { completed: 1, failed: 1 },
        firstAt: '2026-11-05T01:00:00.000Z',
        taskIds: ['t1', 't2'],
      },
      {
        kind: 'run',
        scheduleId: 'schedule-gone',
        title: 'Old job',
        count: 1,
        statuses: { completed: 1 },
        firstAt: '2026-11-05T09:00:00.000Z',
        taskIds: ['t3'],
      },
    ]);
  });

  it('places extra dated entries (shipping readbacks) on their day', () => {
    const byDay = days(
      buildScheduleCalendar({
        schedules: [],
        extras: [
          {
            kind: 'readback',
            at: '2026-11-05T12:00:00.000Z',
            title: 'Readback: Login',
            featureId: 'f1',
          },
          {
            kind: 'readback',
            at: '2026-12-25T12:00:00.000Z',
            title: 'Out of range',
            featureId: 'f2',
          },
        ],
        from: '2026-11-05T00:00:00.000Z',
        to: '2026-11-06T00:00:00.000Z',
        now: '2026-11-04T00:00:00.000Z',
      }),
    );
    assert.deepStrictEqual(byDay, {
      '2026-11-05': [
        {
          kind: 'readback',
          at: '2026-11-05T12:00:00.000Z',
          firstAt: '2026-11-05T12:00:00.000Z',
          title: 'Readback: Login',
          featureId: 'f1',
        },
      ],
    });
  });

  it('caps runaway projections and says which schedules were cut', () => {
    const res = buildScheduleCalendar({
      schedules: [schedule({ intervalMs: 1000, nextRunAt: '2026-11-05T00:00:00.000Z' })],
      from: '2026-11-05T00:00:00.000Z',
      to: '2026-11-06T00:00:00.000Z',
      now: '2026-11-04T00:00:00.000Z',
      maxOccurrences: 10,
    });
    assert.strictEqual(days(res)['2026-11-05'][0].count, 10);
    assert.deepStrictEqual(res.data.truncated, ['schedule-a']);
  });

  it('rejects bad ranges', () => {
    const base = { schedules: [], now: '2026-11-04T00:00:00.000Z' };
    const cases = [
      { from: 'nope', to: '2026-11-06T00:00:00.000Z' },
      { from: '2026-11-06T00:00:00.000Z', to: '2026-11-05T00:00:00.000Z' },
      { from: '2026-11-01T00:00:00.000Z', to: '2027-01-15T00:00:00.000Z' },
    ];
    for (const range of cases) {
      const res = buildScheduleCalendar({ ...base, ...range });
      assert.strictEqual(res.success, false, JSON.stringify(range));
      assert.strictEqual(res.errorCode, ErrorCodes.TASK_CALENDAR_RANGE_INVALID_014);
    }
  });

  it('serves the calendar over GET /api/calendar', async () => {
    // The calendar plans from max(nextRunAt, real now), so the window must lie in the future.
    const dayStart = Math.floor(Date.now() / (24 * HOUR)) * 24 * HOUR + 24 * HOUR;
    const iso = (/** @type {number} */ offsetMs) => new Date(dayStart + offsetMs).toISOString();
    const scheduler = { listSchedules: () => [schedule({ nextRunAt: iso(HOUR) })] };
    const dispatcher = { listTasks: () => [] };
    const shipping = {
      calendarEntries: () => [
        {
          kind: 'readback',
          at: iso(12 * HOUR),
          title: 'Readback: Login',
          featureId: 'f1',
        },
      ],
    };
    const params = new URLSearchParams({
      from: iso(0),
      to: iso(24 * HOUR),
      tz: '0',
    });
    const res = await handleCalendarRequest({
      method: 'GET',
      pathname: '/api/calendar',
      searchParams: params,
      services: { scheduler, dispatcher, shipping },
    });
    assert.strictEqual(res?.status, 200);
    const kinds = res.payload.data.days[0].items.map((/** @type {any} */ i) => i.kind);
    assert.deepStrictEqual(kinds, ['planned', 'readback']);

    const bad = await handleCalendarRequest({
      method: 'GET',
      pathname: '/api/calendar',
      searchParams: new URLSearchParams({ from: 'x', to: 'y' }),
      services: { scheduler, dispatcher },
    });
    assert.strictEqual(bad?.status, 400);

    const other = await handleCalendarRequest({
      method: 'GET',
      pathname: '/api/tasks',
      searchParams: params,
      services: { scheduler, dispatcher },
    });
    assert.strictEqual(other, null);
  });
});

describe('Schedule calendar - time zones', () => {
  it('follows a DST change when given an IANA time zone (New York, 2026-11-01)', () => {
    const res = buildScheduleCalendar({
      schedules: [schedule({ intervalMs: 24 * HOUR, nextRunAt: '2026-11-01T04:30:00.000Z' })],
      from: '2026-11-01T04:00:00.000Z',
      to: '2026-11-03T05:00:00.000Z',
      timeZone: 'America/New_York',
      tzOffsetMinutes: 240,
      now: '2026-10-31T00:00:00.000Z',
    });
    // 04:30Z is 00:30 EDT on 11-01, then 23:30 EST on 11-01 and 23:30 EST on 11-02.
    const byDay = days(res);
    assert.strictEqual(byDay['2026-11-01'][0].count, 2);
    assert.strictEqual(byDay['2026-11-02'][0].count, 1);
  });

  it('rejects an unknown time zone and an offset beyond a day', () => {
    const base = {
      schedules: [],
      from: '2026-11-05T00:00:00.000Z',
      to: '2026-11-06T00:00:00.000Z',
    };
    for (const extra of [
      { timeZone: 'Mars/Olympus' },
      { tzOffsetMinutes: 1e15 },
      { tzOffsetMinutes: -1441 },
    ]) {
      const res = buildScheduleCalendar({ ...base, ...extra });
      assert.strictEqual(res.success, false, JSON.stringify(extra));
      assert.strictEqual(res.errorCode, ErrorCodes.TASK_CALENDAR_RANGE_INVALID_014);
    }
  });
});
