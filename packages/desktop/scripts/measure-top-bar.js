#!/usr/bin/env node
// Measures the Studio top bar in Electron's Chromium across window widths and fails if it
// overflows or any control wraps into a second line. jsdom has no layout, so this is the
// check for the CSS width tiers in index.html.
//
// Usage (from packages/desktop): npx electron scripts/measure-top-bar.js [--json]
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

const HTML = path.join(__dirname, '..', 'index.html');
const MIN_WIDTH = 960; // BrowserWindow minWidth in main.js
const MAX_WIDTH = 2400;
const STEP = 20;
const ROW_HEIGHT = 40; // a control taller than this has wrapped

const MEASURE = `(() => {
  const bar = document.querySelector('.top-bar');
  const style = getComputedStyle(bar);
  const controls = bar.querySelector('.controls');
  const shown = [...controls.children].filter((el) => el.offsetParent);
  const gap = parseFloat(getComputedStyle(controls).columnGap) || 0;
  const need =
    parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) +
    bar.querySelector('.brand').getBoundingClientRect().width +
    shown.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0) +
    gap * Math.max(shown.length - 1, 0);
  const wrapped = [...bar.querySelectorAll('.brand, .controls > *, .btn-mode, .chip')]
    .filter((el) => el.offsetParent && el.getBoundingClientRect().height > ${ROW_HEIGHT})
    .map((el) => el.id || el.className);
  return { overflow: bar.scrollWidth - bar.clientWidth, need: Math.ceil(need), wrapped };
})()`;

async function measureAt(win, width) {
  win.webContents.enableDeviceEmulation({
    screenPosition: 'desktop',
    screenSize: { width, height: 900 },
    viewSize: { width, height: 900 },
    viewPosition: { x: 0, y: 0 },
    deviceScaleFactor: 1,
    scale: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 60));
  return { width, ...(await win.webContents.executeJavaScript(MEASURE)) };
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 900 });
  await win.loadFile(HTML);
  // Worst case: dual layout also shows the split-ratio buttons.
  await win.webContents.executeJavaScript(
    "document.getElementById('dual-ratios').style.display = 'flex'",
  );
  const rows = [];
  for (let width = MIN_WIDTH; width <= MAX_WIDTH; width += STEP) {
    rows.push(await measureAt(win, width));
  }
  const bad = rows.filter((r) => r.overflow > 0 || r.wrapped.length > 0);
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(rows)}\n`);
  } else {
    for (const r of rows) {
      const flag = r.overflow > 0 || r.wrapped.length ? '  <-- FAIL' : '';
      process.stdout.write(
        `${r.width}px need=${r.need} overflow=${r.overflow} wrapped=${r.wrapped.join(',') || '-'}${flag}\n`,
      );
    }
    process.stdout.write(`${bad.length ? 'FAIL' : 'OK'}: ${rows.length} widths checked\n`);
  }
  app.exit(bad.length ? 1 : 0);
});
