const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { EvolverWorkbench } = require('../../../core/src/evolver/evolver-workbench.js');

const HTML = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');

async function loadWorkbench() {
  const workbench = new EvolverWorkbench();
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    virtualConsole: new VirtualConsole(),
    beforeParse(window) {
      /** @type {any} */ (window).nomadDesktop = {
        getSettings: async () => ({ layout: 'evolver', activePlatforms: ['chatgpt'] }),
        setLayout: () => {},
        evolverGetState: async () => workbench.getWorkbenchState(),
        evolverApproveGene: async (/** @type {{ geneId: string }} */ { geneId }) =>
          workbench.approveGene(geneId),
      };
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  const win = /** @type {any} */ (dom.window);
  await win.eval('loadEvolverWorkbench()');
  return win;
}

/** @param {any} el */
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();

test('Evolver: a banner says what is real and what is an example', async () => {
  const win = await loadWorkbench();
  const banner = text(win.document.getElementById('evo-demo-banner'));
  assert.match(banner, /範例/);
  assert.match(banner, /不會呼叫 AI/);
  assert.match(banner, /批准/);
  assert.match(banner, /回滾/);
});

test('Evolver: the how-to starts collapsed and walks through the real flow', async () => {
  const win = await loadWorkbench();
  const guide = win.document.getElementById('evo-guide');
  assert.strictEqual(guide.tagName, 'DETAILS');
  assert.strictEqual(guide.open, false);
  assert.match(text(guide.querySelector('summary')), /操作說明/);

  const steps = [...guide.querySelectorAll('ol li')].map(text);
  assert.strictEqual(steps.length, 4);
  assert.match(steps[0], /不要/);
  assert.match(steps[1], /審查三庫編譯預覽/);
  assert.match(steps[2], /批准固化/);
  assert.match(steps[3], /一鍵回滾/);
  assert.match(text(guide), /全域規則/);
  assert.match(text(guide), /切回單欄/);
});

test('Evolver: patch buttons do not promise a merge that never happens', async () => {
  const win = await loadWorkbench();
  const view = win.document.getElementById('evo-active-patch-view');
  assert.doesNotMatch(text(view), /合併至主幹/);
  assert.match(text(view), /不改檔案/);

  await win.eval(
    `window.nomadDesktop.evolverResolvePatch = undefined;
     handleResolveEvoPatch('PATCH_LAYOUT_EVOLVER_001', 'MERGE')`,
  );
  assert.match(text(win.document.getElementById('evo-patch-resolved')), /範例/);
});

test('Evolver: the sandbox panel labels the seeded worktree as an example', async () => {
  const win = await loadWorkbench();
  const left = text(win.document.querySelector('.evo-pane-left'));
  assert.doesNotMatch(left, /隔離保護中/);
  assert.match(left, /影子沙盒 Worktree.*範例/);
  assert.match(left, /基因預算.*範例/);
});

test('Evolver: gene cards do not claim a sandbox pass that was never run', async () => {
  const win = await loadWorkbench();
  assert.doesNotMatch(text(win.document.getElementById('evo-pending-genes-list')), /PASS/);
  assert.doesNotMatch(text(win.document.getElementById('evo-chat-stream')), /沙盒 100% 通過/);
  const active = text(win.document.getElementById('evo-active-genes-list'));
  assert.match(active, /範例計數/);
  assert.match(active, /未接線/);
});

test('Evolver: canned replies are badged, real approvals are not', async () => {
  const win = await loadWorkbench();
  const stream = win.document.getElementById('evo-chat-stream');
  const cards = () => [...stream.querySelectorAll('.evo-msg-card:not(.evo-msg-user)')];
  assert.strictEqual(cards().length, 1);
  assert.match(text(cards()[0]), /範例回覆/);

  await win.eval(`handleApproveEvoGene('GEN_DOM_LEXICAL_INSERT_005')`);
  const last = cards().at(-1);
  assert.match(text(last), /已通過 Auto-Guarded/);
  assert.doesNotMatch(text(last), /範例回覆/);
});

test('Evolver: the prompt box says it is not sent to any AI, only on this layout', async () => {
  const win = await loadWorkbench();
  const input = win.document.getElementById('prompt-input');
  win.eval(`state.layout = 'evolver'; state.isDashboardOpen = false; renderUI();`);
  assert.match(input.placeholder, /不會送到 AI/);

  win.eval(`state.layout = 'focus'; renderUI();`);
  assert.match(input.placeholder, /同步派發/);
});
