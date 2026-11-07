const test = require('node:test');
const assert = require('node:assert');
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const { composeDashboard } = require('@nomad/dashboard');

const DASHBOARD_DIR = path.join(__dirname, '../../../dashboard');
const INDEX = fs.readFileSync(path.join(DASHBOARD_DIR, 'index.html'), 'utf8');
const SNAPSHOT = JSON.parse(
  fs.readFileSync(path.join(DASHBOARD_DIR, 'github-inventory.json'), 'utf8'),
);
const HTML = composeDashboard(INDEX);
/** @type {any[]} */
const openWindows = [];

const FIXTURE = {
  snapshotAt: '2026-11-07',
  account: 'tester',
  summary: { repos: 3, forks: 2, stars: 3, archivedStars: 1, staleStars: 1, secretLeaks: 0 },
  groups: {
    active: { label: '有在開發', action: '改變存放方式' },
    noise: { label: '雜訊／過時', action: '封存或清理' },
  },
  categories: { agents: 'Agent 框架', other: '其他' },
  riskLabels: { high: '疑似惡意' },
  deleted: [{ name: 'gone', upstream: 'up/gone', at: '2026-11-07' }],
  forks: [
    {
      name: 'mine',
      upstream: 'up/mine',
      upStars: 10,
      upArchived: true,
      license: 'MIT',
      lang: 'C',
      ahead: 5,
      behind: 0,
      myPushed: '2026-11-01',
      group: 'active',
      advice: 'Detach it',
    },
    {
      name: 'old',
      upstream: 'up/old',
      upStars: 1,
      upArchived: false,
      license: null,
      lang: null,
      ahead: 1,
      behind: 900,
      myPushed: '2025-01-01',
      group: 'noise',
      advice: 'Archive it',
    },
  ],
  stars: [
    {
      name: 'a/agent',
      stars: 5,
      lang: 'Python',
      starredAt: '2026-10-01',
      pushed: '2026-11-01',
      archived: false,
      stale: false,
      desc: 'An agent',
      category: 'agents',
      risk: null,
      riskNote: null,
    },
    {
      name: 'b/lure',
      stars: 9,
      lang: 'C++',
      starredAt: '2026-09-01',
      pushed: '2026-11-01',
      archived: false,
      stale: false,
      desc: '<img src=x onerror=alert(1)>',
      category: 'other',
      risk: 'high',
      riskNote: 'Do not run it',
    },
    {
      name: 'c/old',
      stars: 2,
      lang: null,
      starredAt: '2024-01-01',
      pushed: '2023-01-01',
      archived: true,
      stale: true,
      desc: 'Old thing',
      category: 'other',
      risk: null,
      riskNote: null,
    },
  ],
};

/** @param {{ fixture?: object }} [opts] */
async function loadDashboard(opts = {}) {
  const dom = new JSDOM(HTML, {
    url: 'http://127.0.0.1:8765/dashboard',
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      // @ts-ignore - minimal stub
      window.EventSource = class {
        close() {}
      };
      // @ts-ignore - minimal stub
      window.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
        text: async () => '',
      });
    },
  });
  openWindows.push(dom.window);
  await new Promise((resolve) => setTimeout(resolve, 60));
  const { document } = dom.window;
  if (opts.fixture)
    document.getElementById('gh-inventory-data').textContent = JSON.stringify(opts.fixture);
  dom.window.filterCategory('github');
  return { window: dom.window, document };
}

/** @param {Document} document */
const starNames = (document) =>
  [...document.querySelectorAll('#gh-star-list .gh-row-head a')].map((a) => a.textContent);

test.afterEach(() => {
  while (openWindows.length) openWindows.pop().close();
});

test('composeDashboard inlines the GitHub snapshot as parseable, script-safe JSON', () => {
  const dom = new JSDOM(HTML);
  const raw = dom.window.document.getElementById('gh-inventory-data').textContent;
  assert.deepStrictEqual(JSON.parse(raw), SNAPSHOT);
  assert.ok(!HTML.includes('@nomad:github-panel'), 'panel marker replaced');
  assert.ok(!HTML.includes('@nomad:github-inventory-data'), 'data marker replaced');
  dom.window.close();
});

test('GitHub tab: shows its section, the summary and forks grouped with their advice', async () => {
  const { document } = await loadDashboard({ fixture: FIXTURE });

  assert.strictEqual(document.getElementById('github-section').style.display, 'block');
  assert.strictEqual(document.getElementById('task-control-plane-section').style.display, 'none');
  const tiles = [...document.querySelectorAll('#gh-tiles .gh-tile')].map((t) => t.textContent);
  assert.deepStrictEqual(tiles.slice(0, 2), ['2Fork', '3星標']);
  assert.ok(tiles.includes('1風險星標'));

  const groups = [...document.querySelectorAll('#gh-forks .gh-group h3')].map((h) => h.textContent);
  assert.deepStrictEqual(groups, ['有在開發（1）', '雜訊／過時（1）']);
  const forks = document.getElementById('gh-forks').textContent || '';
  assert.match(forks, /tester\/mine/);
  assert.match(forks, /上游已封存/);
  assert.match(forks, /領先 5 ／ 落後 0/);
  assert.match(forks, /Detach it/);
});

test('Stars tab: risky repos sort first, filters narrow the list, text is never HTML', async () => {
  const { window, document } = await loadDashboard({ fixture: FIXTURE });
  document.querySelector('[data-gh-tab="stars"]').dispatchEvent(new window.MouseEvent('click'));

  assert.strictEqual(document.getElementById('gh-stars').hidden, false);
  assert.strictEqual(document.getElementById('gh-forks').hidden, true);
  assert.deepStrictEqual(starNames(document), ['b/lure', 'a/agent', 'c/old']);
  assert.strictEqual(document.querySelector('#gh-star-list img'), null, 'descriptions stay text');
  assert.match(document.getElementById('gh-star-list').textContent || '', /<img src=x/);

  const flag = document.getElementById('gh-flag');
  flag.value = 'archived';
  flag.dispatchEvent(new window.Event('change'));
  assert.deepStrictEqual(starNames(document), ['c/old']);

  flag.value = '';
  flag.dispatchEvent(new window.Event('change'));
  const cat = document.getElementById('gh-cat');
  cat.value = 'agents';
  cat.dispatchEvent(new window.Event('change'));
  assert.deepStrictEqual(starNames(document), ['a/agent']);

  cat.value = '';
  cat.dispatchEvent(new window.Event('change'));
  const search = document.getElementById('gh-search');
  search.value = 'OLD THING';
  search.dispatchEvent(new window.Event('input'));
  assert.deepStrictEqual(starNames(document), ['c/old']);
  assert.strictEqual(document.getElementById('gh-star-count').textContent, '共 1 筆');
});

test('Deleted tab lists each removed fork with its re-fork command', async () => {
  const { window, document } = await loadDashboard({ fixture: FIXTURE });
  document.querySelector('[data-gh-tab="deleted"]').dispatchEvent(new window.MouseEvent('click'));
  assert.match(
    document.getElementById('gh-deleted').textContent || '',
    /gh repo fork up\/gone --clone=false/,
  );
});

test('the real snapshot renders every fork and caps the star list', async () => {
  const { document } = await loadDashboard();
  assert.strictEqual(document.querySelectorAll('#gh-forks .gh-row').length, SNAPSHOT.forks.length);
  assert.strictEqual(document.querySelectorAll('#gh-star-list .gh-row').length, 200);
  assert.match(document.getElementById('gh-star-count').textContent || '', /共 367 筆/);
});
