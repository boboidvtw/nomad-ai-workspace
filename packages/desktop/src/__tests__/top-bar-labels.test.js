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

test('Top bar: brand and the two dropdowns never wrap or shrink', () => {
  const rule = HTML.match(
    /((?:\s*\.top-bar [.\w-]+,?)+)\s*\{\s*white-space: nowrap;\s*flex-shrink: 0;/,
  );
  assert.ok(rule, 'nowrap rule exists');
  for (const sel of ['.brand', '.top-select']) {
    assert.ok(rule[1].includes(`.top-bar ${sel}`), `${sel} is covered`);
  }
});

/** @param {any} sel */
const optionTexts = (sel) => [...sel.options].filter((o) => !o.hidden).map((o) => o.textContent);

test('Top bar: layouts are one native dropdown, so the menu opens above the AI views', async () => {
  const win = await loadShell();
  const doc = win.document;
  assert.strictEqual(doc.querySelectorAll('.top-bar .btn-mode').length, 0, 'no layout buttons');
  const sel = doc.getElementById('layout-select');
  assert.strictEqual(sel.tagName, 'SELECT');
  assert.ok(sel.title && sel.getAttribute('aria-label'), 'has a tooltip and a label');
  assert.deepStrictEqual(optionTexts(sel), [
    '單欄專注',
    '雙欄並排',
    '三欄對比',
    '四宮格競技',
    '六宮格矩陣',
    '🧬 自進化 IDE',
  ]);
  assert.strictEqual(sel.value, 'focus');

  sel.value = 'triple';
  sel.dispatchEvent(new win.Event('change'));
  assert.strictEqual(win.eval('state.layout'), 'triple');
  assert.deepStrictEqual([...win.eval('state.activePlatforms')], ['chatgpt', 'claude', 'gemini']);

  sel.value = 'evolver';
  sel.dispatchEvent(new win.Event('change'));
  assert.ok(sel.classList.contains('is-evolver'), 'IDE keeps its own look');
});

test('Top bar: a custom platform mix shows as its own layout entry', async () => {
  const win = await loadShell();
  win.eval(
    "state.layout = 'custom'; state.activePlatforms = ['chatgpt','claude','gemini','grok','copilot']; renderUI();",
  );
  const sel = win.document.getElementById('layout-select');
  assert.strictEqual(sel.value, 'custom');
  assert.strictEqual(sel.selectedOptions[0].textContent.trim(), '自訂 5 欄');
});

test('Top bar: platforms are one native dropdown that toggles the picked platform', async () => {
  const win = await loadShell();
  const doc = win.document;
  assert.strictEqual(doc.querySelectorAll('.top-bar .chip').length, 0, 'no platform chips');
  const sel = doc.getElementById('platform-select');
  assert.strictEqual(sel.tagName, 'SELECT');
  assert.ok(sel.title && sel.getAttribute('aria-label'), 'has a tooltip and a label');
  assert.deepStrictEqual(optionTexts(sel), [
    '✓ ChatGPT',
    '\u3000 Claude',
    '\u3000 Gemini',
    '\u3000 Grok',
    '\u3000 Copilot',
    '\u3000 Perplexity',
  ]);
  const summary = () => sel.selectedOptions[0].textContent.trim();
  assert.strictEqual(sel.value, '', 'the closed dropdown shows the summary');
  assert.strictEqual(summary(), 'ChatGPT');

  // Picking a hidden platform in focus swaps it in, like the old chips did.
  sel.value = 'gemini';
  sel.dispatchEvent(new win.Event('change'));
  assert.deepStrictEqual([...win.eval('state.activePlatforms')], ['gemini']);
  assert.strictEqual(sel.value, '', 'resets to the summary after a pick');
  assert.strictEqual(summary(), 'Gemini');

  win.eval("handleLayoutClick('triple')");
  assert.strictEqual(summary(), 'ChatGPT 等 3 個');
  assert.ok(optionTexts(sel).includes('✓ Gemini'));

  // Picking a shown platform removes it.
  sel.value = 'claude';
  sel.dispatchEvent(new win.Event('change'));
  assert.deepStrictEqual([...win.eval('state.activePlatforms')], ['chatgpt', 'gemini']);
  assert.strictEqual(summary(), 'ChatGPT、Gemini');
});
