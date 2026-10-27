const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const MAIN = fs.readFileSync(path.join(__dirname, '../../main.js'), 'utf8');

async function loadShell() {
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      /** @type {any} */ (window).nomadDesktop = {
        getSettings: async () => ({ layout: 'focus', activePlatforms: ['chatgpt'] }),
        setLayout: () => {},
      };
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  return /** @type {any} */ (dom.window);
}

/**
 * Renders the workspace pill for the given active workspace title.
 * @param {any} win
 * @param {string | null} title null = no workspace at all
 */
function renderTitle(win, title) {
  const state = title === null ? [] : [{ id: 'w1', title }];
  win.eval(
    `workspacesState = { workspaces: ${JSON.stringify(state)}, activeWorkspace: null };` +
      'renderWorkspaces();',
  );
  return {
    top: win.document.getElementById('top-workspace-title').textContent.trim(),
    panel: win.document.getElementById('ws-active-title').textContent.trim(),
  };
}

test('Top bar: the workspace pill reads as a workspace name, not a feature', async () => {
  const win = await loadShell();
  for (const title of [null, '', '新協作對話', '協作會話']) {
    const shown = renderTitle(win, title);
    assert.strictEqual(shown.top, '未命名工作區', `title ${JSON.stringify(title)}`);
    if (title !== null) assert.strictEqual(shown.panel, '未命名工作區');
  }
  assert.deepStrictEqual(renderTitle(win, '1014 | 設計 | 快取'), {
    top: '1014 | 設計 | 快取',
    panel: '1014 | 設計 | 快取',
  });
  assert.match(win.document.getElementById('btn-workspace-pill').title, /目前工作區/);
});

test('Top bar: the round-table pill uses the sidebar tab name', async () => {
  const win = await loadShell();
  const pill = win.document.getElementById('btn-roundtable');
  assert.strictEqual(pill.textContent.replace(/\s+/g, ' ').trim(), '🤝 圓桌');
  assert.match(pill.title, /AI 圓桌協作/);
});

test('Top bar: new workspaces are created untitled, not as "新協作對話"', () => {
  assert.ok(!MAIN.includes("title: '新協作對話'"));
  assert.ok(MAIN.includes("title: '未命名工作區'"));
});

test('Top bar: pills that drop their label on narrow windows keep an icon and a tooltip', async () => {
  const win = await loadShell();
  const pills = [
    ...win.document.querySelectorAll('.top-bar .pill-compact, .top-bar .pill-compact-narrow'),
  ];
  assert.ok(pills.length >= 5, `found ${pills.length} compact pills`);
  for (const pill of pills) {
    assert.ok(pill.title, `${pill.id} has a tooltip`);
    const label = pill.querySelector('.pill-label');
    assert.ok(label, `${pill.id} has a .pill-label`);
    const rest = pill.textContent.replace(label.textContent, '').trim();
    assert.ok(rest.length > 0, `${pill.id} keeps an icon outside the label`);
  }
  assert.match(HTML, /\.top-bar \.pill-info,[^{]*\{\s*white-space: nowrap;\s*flex-shrink: 0;/);
});

test('Top bar: brand, layout buttons and platform chips never wrap or shrink', () => {
  const rule = HTML.match(
    /((?:\s*\.top-bar [.\w-]+,?)+)\s*\{\s*white-space: nowrap;\s*flex-shrink: 0;/,
  );
  assert.ok(rule, 'nowrap rule exists');
  for (const sel of ['.brand', '.btn-group', '.platform-chips', '.btn-mode', '.chip']) {
    assert.ok(rule[1].includes(`.top-bar ${sel}`), `${sel} is covered`);
  }
});

test('Top bar: layout buttons keep their full name while showing a short label', async () => {
  const win = await loadShell();
  const expected = {
    'btn-focus': '單欄專注',
    'btn-dual': '雙欄並排',
    'btn-triple': '三欄對比',
    'btn-quad': '四宮格競技',
    'btn-hexa': '六宮格矩陣',
    'btn-evolver': '🧬 自進化 IDE',
  };
  for (const [id, name] of Object.entries(expected)) {
    const btn = win.document.getElementById(id);
    assert.strictEqual(btn.textContent.replace(/\s+/g, ' ').trim(), name, id);
    assert.ok(btn.title.includes(name.replace('🧬 ', '')), `${id} tooltip names the layout`);
    assert.ok(btn.querySelector('.lbl-full'), `${id} has a part to drop on narrow windows`);
  }
});

test('Top bar: platform chips keep a dot and a tooltip when the name is hidden', async () => {
  const win = await loadShell();
  const chips = [...win.document.querySelectorAll('.top-bar .platform-chips .chip')];
  assert.strictEqual(chips.length, 6);
  for (const chip of chips) {
    const name = chip.querySelector('.chip-label');
    assert.ok(name, `${chip.id} wraps its name in .chip-label`);
    assert.ok(chip.querySelector('.dot'), `${chip.id} keeps its dot`);
    assert.strictEqual(chip.title, name.textContent.trim(), `${chip.id} tooltip`);
  }
});
