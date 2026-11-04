const test = require('node:test');
const assert = require('node:assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const { composeDashboard } = require('@nomad/dashboard');

const INDEX = fs.readFileSync(path.join(__dirname, '../../../dashboard/index.html'), 'utf8');
const HTML = composeDashboard(INDEX);
/** @type {any[]} */
const openWindows = [];

const FEATURE = {
  id: 'feat-1',
  title: 'Calendar view',
  problem: 'No overview',
  outcome: 'Month grid',
  contract: 'GET /api/calendar',
  priority: 'medium',
  risk: 'medium',
  activeRisk: 'high',
  target: null,
  builders: ['agent-claude'],
  state: 'verifying',
  pausedFrom: null,
  invariants: [{ id: 'inv-1', text: 'Local day buckets', required: true }],
  squares: [
    {
      id: 'sq-1',
      title: 'Click through <b>month</b>',
      kind: 'user-path',
      covers: ['inv-1'],
      owner: 'operator',
      required: true,
      status: 'open',
      evidence: null,
      by: null,
      at: null,
      taskId: null,
    },
  ],
  release: null,
  readback: null,
  events: [{ at: '2026-11-05T00:00:00.000Z', actor: 'operator', type: 'created', detail: 'x' }],
  nextGate: { to: 'ready', missing: ['square sq-1 has not passed', 'no passed trace square'] },
  createdAt: '2026-11-05T00:00:00.000Z',
  updatedAt: '2026-11-05T00:00:00.000Z',
};

/** @param {string} url */
function fakeData(url) {
  if (url.includes('/api/calendar')) {
    const params = new URL(url).searchParams;
    return {
      from: params.get('from'),
      to: params.get('to'),
      tzOffsetMinutes: Number(params.get('tz')),
      truncated: [],
      days: [
        {
          date: '2026-11-05',
          items: [
            {
              kind: 'planned',
              scheduleId: 's1',
              title: '服務定時健康巡檢',
              assignee: 'agent-local',
              count: 288,
              firstAt: '2026-11-05T00:00:00.000Z',
            },
            {
              kind: 'run',
              scheduleId: 's1',
              title: '服務定時健康巡檢',
              count: 3,
              statuses: { completed: 2, failed: 1 },
              firstAt: '2026-11-05T01:00:00.000Z',
              taskIds: ['t1'],
            },
            {
              kind: 'readback',
              at: '2026-11-05T12:00:00.000Z',
              firstAt: '2026-11-05T12:00:00.000Z',
              title: 'Readback: <img src=x onerror=alert(1)>',
              featureId: 'feat-1',
              status: 'pending',
            },
          ],
        },
      ],
    };
  }
  if (url.endsWith('/api/shipping')) {
    return {
      features: [FEATURE],
      friction: [
        {
          id: 'fr-1',
          featureId: 'feat-1',
          title: 'Square failed',
          severity: 'high',
          status: 'open',
          source: 'square:sq-1',
          createdAt: '2026-11-05T00:00:00.000Z',
          resolvedAt: null,
        },
      ],
      regressions: [],
    };
  }
  if (url.endsWith('/api/shipping/feat-1')) return FEATURE;
  return {};
}

/** @param {{ prompt?: string | null }} [opts] */
async function loadDashboard(opts = {}) {
  /** @type {Array<{ url: string, method: string, body: any }>} */
  const calls = [];
  const dom = new JSDOM(HTML, {
    url: 'http://127.0.0.1:8765/dashboard',
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      window.prompt = () => (opts.prompt === undefined ? 'looked at it' : opts.prompt);
      window.confirm = () => true;
      // @ts-ignore - minimal stub
      window.EventSource = class {
        close() {}
      };
      // @ts-ignore - minimal stub
      window.fetch = async (url, options = {}) => {
        const method = options.method || 'GET';
        calls.push({
          url: String(url),
          method,
          body: options.body ? JSON.parse(options.body) : null,
        });
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: fakeData(String(url)) }),
          text: async () => '',
        };
      };
    },
  });
  openWindows.push(dom.window);
  await new Promise((resolve) => setTimeout(resolve, 60));
  return { window: dom.window, document: dom.window.document, calls };
}

/** @param {number} ms */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test.afterEach(() => {
  while (openWindows.length) openWindows.pop().close();
});

test('Calendar tab: month grid shows planned, past runs and readbacks for the local month', async () => {
  const { window, document, calls } = await loadDashboard();
  window.NomadCalendar.showMonth(2026, 10); // November 2026
  window.filterCategory('calendar');
  await wait(60);

  assert.strictEqual(document.getElementById('calendar-section').style.display, 'block');
  assert.strictEqual(document.getElementById('task-control-plane-section').style.display, 'none');
  const call = calls.find((c) => c.url.includes('/api/calendar'));
  assert.ok(call, 'asked the API for the month');
  const params = new URL(call.url).searchParams;
  assert.strictEqual(params.get('tz'), String(new window.Date().getTimezoneOffset()));
  assert.strictEqual(
    params.get('timeZone'),
    window.Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  assert.ok(
    Date.parse(params.get('to') || '') - Date.parse(params.get('from') || '') <= 42 * 86400000,
  );

  assert.strictEqual(document.getElementById('cal-month-label').textContent, '2026 年 11 月');
  const cell = document.querySelector('[data-date="2026-11-05"]');
  assert.ok(cell, 'the 5th has a cell');
  const chips = [...cell.querySelectorAll('.cal-chip')].map((c) => c.textContent);
  assert.deepStrictEqual(chips, [
    '預計 服務定時健康巡檢 ×288',
    '已跑 服務定時健康巡檢 ×3',
    '回讀 Readback: <img src=x onerror=alert(1)>',
  ]);
  assert.strictEqual(cell.querySelector('img'), null, 'API text is never parsed as HTML');
  assert.ok(cell.querySelector('.cal-chip.run.has-failed'), 'a day with failed runs is flagged');

  cell.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const detail = document.getElementById('cal-day-detail').textContent || '';
  assert.match(detail, /2026-11-05/);
  assert.match(detail, /completed 2/);
  assert.match(detail, /failed 1/);
  assert.match(detail, /agent-local/);
});

test('Shipping tab: portfolio, gate checklist and a square result posted with evidence', async () => {
  const { window, document, calls } = await loadDashboard({ prompt: 'clicked through November' });
  window.filterCategory('shipping');
  await wait(60);

  assert.strictEqual(document.getElementById('shipping-section').style.display, 'block');
  const row = document.querySelector('[data-feature-id="feat-1"]');
  assert.ok(row, 'portfolio lists the feature');
  assert.match(row.textContent || '', /Calendar view/);
  assert.match(row.textContent || '', /驗證中/);
  assert.match(row.textContent || '', /high/);

  row.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  const gate = document.getElementById('ship-gate').textContent || '';
  assert.match(gate, /就緒/);
  assert.match(gate, /square sq-1 has not passed/);
  assert.ok(document.getElementById('ship-advance').disabled, 'advance waits for the gate');

  const square = document.querySelector('[data-square-id="sq-1"]');
  assert.ok(square);
  assert.strictEqual(square.querySelector('b'), null, 'square titles are text, not HTML');
  const pass = /** @type {HTMLButtonElement} */ (square.querySelector('[data-action="passed"]'));
  pass.click();
  await wait(60);
  const post = calls.find(
    (c) => c.method === 'POST' && c.url.endsWith('/api/shipping/feat-1/squares/sq-1'),
  );
  assert.ok(post, 'posted the square result');
  assert.deepStrictEqual(post.body, {
    status: 'passed',
    evidence: 'clicked through November',
    actor: 'operator',
  });

  const friction = document.getElementById('ship-friction').textContent || '';
  assert.match(friction, /Square failed/);
});

test('Shipping tab: cancelling the evidence prompt posts nothing', async () => {
  const { window, document, calls } = await loadDashboard({ prompt: null });
  window.filterCategory('shipping');
  await wait(60);
  document
    .querySelector('[data-feature-id="feat-1"]')
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  /** @type {HTMLButtonElement | null} */ (
    document.querySelector('[data-square-id="sq-1"] [data-action="failed"]')
  )?.click();
  await wait(30);
  assert.strictEqual(calls.filter((c) => c.method === 'POST').length, 0);
});
