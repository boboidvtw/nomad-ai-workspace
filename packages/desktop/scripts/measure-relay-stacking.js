#!/usr/bin/env node
// Runs a relay's stacking sequence on real WebContentsViews in an Electron window and reads the
// window's actual child order after every step. Fails if a held view (relay speaker, bot target)
// ever sits above a view the user is looking at, or if a resize reorders the views. Screen
// capture needs a macOS permission, so this is the check for relay flicker.
//
// Usage (from packages/desktop): npx electron scripts/measure-relay-stacking.js [--json]
const { app, BaseWindow, WebContentsView } = require('electron');
const { calculateLayoutBounds, planViewStacking } = require('../src/layout-engine');
const { applyViewStacking } = require('../src/view-stacking');

const KEYS = ['chatgpt', 'claude', 'gemini', 'grok', 'copilot', 'perplexity'];
const COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#46f0f0'];

/** The steps a three-speaker relay takes, with resizes and a bot hold in between. */
const STEPS = [
  { keep: [], width: 1400 },
  { keep: ['grok'], width: 1400 },
  { keep: ['grok'], width: 1200 },
  { keep: ['gemini'], width: 1200 },
  { keep: ['gemini', 'perplexity'], width: 1200 },
  { keep: ['gemini', 'perplexity'], width: 1500 },
  { keep: ['chatgpt'], width: 1500 },
  { keep: ['claude'], width: 1500 },
  { keep: [], width: 1400 },
];

app.whenReady().then(async () => {
  const win = new BaseWindow({ width: 1400, height: 900, show: false });
  /** @type {Record<string, { view: Electron.WebContentsView }>} */
  const views = {};
  KEYS.forEach((key, i) => {
    const view = new WebContentsView();
    void view.webContents.loadURL(
      `data:text/html,<body style="margin:0;background:${COLORS[i]}">${key}</body>`,
    );
    win.contentView.addChildView(view);
    views[key] = { view };
  });

  const order = () => win.contentView.children.map((v) => KEYS.find((k) => views[k].view === v));
  /** @type {string | null} */
  let lastStackKey = null;
  const failures = [];
  const report = [];
  for (const [i, s] of STEPS.entries()) {
    win.setContentSize(s.width, 900);
    const boundsMap = calculateLayoutBounds({
      winWidth: s.width,
      winHeight: 900,
      topBarHeight: 60,
      bottomBarHeight: 40,
      layout: 'split',
      activePlatforms: ['chatgpt', 'claude'],
      splitRatio: 0.5,
      drawerWidth: 0,
    });
    const before = order();
    const plan = planViewStacking({
      boundsMap,
      keys: KEYS,
      keepRendering: s.keep,
      dashboardOpen: false,
    });
    lastStackKey = applyViewStacking({
      contentView: win.contentView,
      views,
      boundsMap,
      plan,
      dashboardView: null,
      lastStackKey,
      ensureLoaded: () => {},
    });
    const after = order();
    const shown = KEYS.filter((k) => plan.views[k].visible && !s.keep.includes(k));
    const held = s.keep.filter((k) => plan.views[k].visible && !boundsMap[k]?.visible);
    for (const h of held) {
      for (const u of shown) {
        if (after.indexOf(h) > after.indexOf(u)) failures.push(`step ${i}: ${h} above ${u}`);
      }
    }
    const resizeOnly = i > 0 && JSON.stringify(STEPS[i - 1].keep) === JSON.stringify(s.keep);
    if (resizeOnly && JSON.stringify(before) !== JSON.stringify(after)) {
      failures.push(`step ${i}: resize reordered ${before} -> ${after}`);
    }
    report.push({ step: i, keep: s.keep, width: s.width, held, shown, order: after.join('>') });
  }

  if (process.argv.includes('--json')) console.log(JSON.stringify({ report, failures }, null, 2));
  else {
    for (const r of report) {
      console.log(
        `${r.step} keep=[${r.keep}] w=${r.width} held=[${r.held}] order(bottom>top)=${r.order}`,
      );
    }
    console.log(
      failures.length
        ? `FAIL\n${failures.join('\n')}`
        : 'OK: held views stay under the shown ones, resizes keep the order',
    );
  }
  app.exit(failures.length ? 1 : 0);
});
