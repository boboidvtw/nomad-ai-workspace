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

const SERVICES = {
  services: [
    { id: 'laya', label: 'Laya', state: 'running' },
    { id: 'lmstudio', label: 'LM Studio', state: 'failed' },
    { id: 'mystery', label: 'Mystery <b>svc</b>', state: 'starting' },
  ],
};
const ROSTER = [
  { id: 'agent-claude', name: 'Claude', role: 'Coder', platform: 'claude', status: 'busy' },
  { id: 'agent-local', name: 'Local', role: 'Ops', platform: 'local', status: 'idle' },
];
const TASKS = [
  {
    id: 't1',
    title: 'Ship <i>neural</i> tab',
    status: 'in_progress',
    assignee: 'agent-claude',
    priority: 'high',
    updatedAt: '2026-11-09T02:00:00.000Z',
  },
  {
    id: 't2',
    title: 'Ghost assignee',
    status: 'todo',
    assignee: 'agent-nobody',
    updatedAt: '2026-11-09T01:00:00.000Z',
  },
  { id: 't3', title: 'Dropped', status: 'cancelled', updatedAt: '2026-11-09T03:00:00.000Z' },
];

/** @param {string} url */
function fakeData(url) {
  if (url.endsWith('/api/services')) return SERVICES;
  if (url.endsWith('/api/roster')) return ROSTER;
  if (url.endsWith('/api/tasks')) return TASKS;
  return {};
}

async function loadDashboard() {
  /** @type {string[]} */
  const calls = [];
  const dom = new JSDOM(HTML, {
    url: 'http://127.0.0.1:8765/dashboard',
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      window.confirm = () => true;
      // @ts-ignore - minimal stub
      window.EventSource = class {
        close() {}
      };
      // @ts-ignore - minimal stub
      window.fetch = async (url) => {
        calls.push(String(url));
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

/** @param {Document} document */
function listLabels(document) {
  return [...document.querySelectorAll('#neural-list button')].map((b) => b.textContent);
}

test.afterEach(() => {
  while (openWindows.length) openWindows.pop().close();
});

test('Neural panel: marker is replaced and the tab exists', () => {
  assert.ok(!HTML.includes('@nomad:neural-panel'), 'panel marker replaced');
  assert.ok(HTML.includes('id="neural-section"'));
  assert.ok(HTML.includes("filterCategory('neural')"));
});

test('buildGraph: hubs per module, live status, assignment links', async () => {
  const { window } = await loadDashboard();
  // JSON round trip: JSDOM arrays come from another realm and fail deepStrictEqual.
  const graph = JSON.parse(
    JSON.stringify(
      window.NomadNeural.buildGraph({
        items: [
          { type: 'service', id: 'card-laya', title: 'Laya', category: 'ai' },
          { type: 'service', id: 'card-obsidian', title: 'Obsidian', category: 'tools' },
          { type: 'pipeline', title: 'not a node' },
        ],
        services: SERVICES.services,
        agents: ROSTER,
        tasks: TASKS,
      }),
    ),
  );
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));

  assert.strictEqual(byId['svc:laya'].status, 'running');
  assert.strictEqual(byId['svc:obsidian'].status, 'unknown', 'no live entry → unknown');
  assert.strictEqual(byId['svc:mystery'].group, 'other', 'unmatched service gets its own hub');
  assert.ok(!byId['task:t3'], 'cancelled tasks are left out');
  assert.ok(!graph.nodes.some((n) => n.label === 'not a node'), 'pipelines are not nodes');

  const hubIds = graph.nodes.filter((n) => n.kind === 'hub').map((n) => n.id);
  assert.deepStrictEqual(hubIds, ['hub-ai', 'hub-tools', 'hub-other', 'hub-roster', 'hub-tasks']);

  const assigns = graph.edges.filter((e) => e.kind === 'assign');
  assert.deepStrictEqual(assigns, [{ from: 'task:t1', to: 'agent:agent-claude', kind: 'assign' }]);
  const coreEdges = graph.edges.filter((e) => e.kind === 'core');
  assert.strictEqual(coreEdges.length, hubIds.length);
});

test('Neural tab: loads live data, drills into a module and back with Escape', async () => {
  const { window, document, calls } = await loadDashboard();
  window.filterCategory('neural');
  await wait(40);

  assert.strictEqual(document.getElementById('neural-section').style.display, 'block');
  assert.strictEqual(document.getElementById('task-control-plane-section').style.display, 'none');
  for (const route of ['/api/services', '/api/roster', '/api/tasks']) {
    assert.ok(
      calls.some((u) => u.endsWith(route)),
      route + ' requested',
    );
  }

  const modules = listLabels(document);
  assert.ok(modules.includes('👥 Agent 名冊'), modules.join(','));
  assert.ok(modules.includes('📋 近期任務'));

  const tasksHub = [...document.querySelectorAll('#neural-list button')].find(
    (b) => b.textContent === '📋 近期任務',
  );
  tasksHub.click();
  assert.match(document.getElementById('neural-crumbs').textContent, /近期任務/);
  assert.deepStrictEqual(listLabels(document), ['Ship <i>neural</i> tab', 'Ghost assignee']);
  assert.ok(!document.querySelector('#neural-list i'), 'API text is not parsed as HTML');

  document.querySelector('#neural-list button[data-node="task:t1"]').click();
  const detail = document.getElementById('neural-detail');
  assert.match(detail.textContent, /進行中/);
  assert.ok(
    detail.querySelector('button[data-node="agent:agent-claude"]'),
    'detail links to the assigned agent',
  );

  const esc = () =>
    document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  esc();
  assert.match(detail.textContent, /近期任務/, 'first Escape clears the selection');
  esc();
  assert.ok(listLabels(document).includes('👥 Agent 名冊'), 'second Escape returns to overview');
});

test('buildGraph: multi-service cards split per service, Studio folds into the core', async () => {
  const { window } = await loadDashboard();
  const graph = JSON.parse(
    JSON.stringify(
      window.NomadNeural.buildGraph({
        items: [
          {
            type: 'service',
            id: 'card-hermes',
            title: 'Hermes',
            desc: 'agent',
            category: 'agents',
          },
          { type: 'service', id: 'card-laya', title: 'Laya', category: 'ai' },
        ],
        cards: [
          { card: 'card-hermes', services: ['hermes-cli', 'hermes-web'] },
          { card: 'card-laya', services: ['laya'] },
        ],
        services: [
          { id: 'hermes-cli', label: 'Hermes CLI', state: 'ready' },
          { id: 'hermes-web', label: 'Hermes Web', state: 'stopped' },
          { id: 'laya', label: 'Laya', state: 'running' },
          { id: 'nomad-studio', label: 'Nomad AI Studio', state: 'stopped' },
        ],
      }),
    ),
  );
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
  assert.strictEqual(byId['svc:hermes-cli'].group, 'agents');
  assert.strictEqual(byId['svc:hermes-cli'].label, 'Hermes CLI');
  assert.strictEqual(byId['svc:hermes-cli'].status, 'ready');
  assert.strictEqual(byId['svc:hermes-web'].status, 'stopped');
  assert.ok(!byId['svc:hermes'], 'the card itself is not a separate node');
  assert.strictEqual(byId['svc:laya'].label, 'Laya');
  assert.ok(!byId['svc:nomad-studio'], 'Studio is the core, not a leaf');
  assert.ok(!byId['hub-other'], 'nothing left over for the other hub');
});

test('Neural tab: uses the service panel card mapping', async () => {
  const { window } = await loadDashboard();
  assert.ok(Array.isArray(window.NomadServiceCards), 'service panel exposes its mapping');
  const hermes = window.NomadServiceCards.find((c) => c.card === 'card-hermes');
  assert.ok(hermes && hermes.services.length > 1);
});

test('Neural tab: a failed data source shows a notice instead of breaking', async () => {
  const { window, document } = await loadDashboard();
  window.fetch = async () => {
    throw new Error('offline');
  };
  window.filterCategory('neural');
  await wait(40);
  assert.match(document.getElementById('neural-status').textContent, /3 個資料來源無法連線/);
  assert.ok(listLabels(document).length > 0, 'service hubs still render from ALL_ITEMS');
});
