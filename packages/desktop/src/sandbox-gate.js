/**
 * Nomad AI Studio - Evolver sandbox test gate
 * Runs the Evolver regression tests with `node --test` and reports the real counts, so the
 * workbench's gate panel shows an actual result instead of a canned one. When the test files
 * are not on disk (a packaged app does not ship them) it says so rather than pretending.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const SANDBOX_TEST_FILES = [
  path.join('core', 'src', '__tests__', 'evolver-workbench.test.js'),
  path.join('desktop', 'src', '__tests__', 'layout-engine.test.js'),
];
const TIMEOUT_MS = 60_000;

/** @param {string} output */
function parseTestSummary(output) {
  const read = (/** @type {string} */ label) => {
    const m = output.match(new RegExp(`^ℹ ${label} (\\d+)$`, 'm'));
    return m ? Number(m[1]) : null;
  };
  const total = read('tests');
  const pass = read('pass');
  const fail = read('fail');
  if (total === null || pass === null || fail === null) return null;
  return { total, pass, fail, skipped: read('skipped') ?? 0 };
}

/**
 * @param {string} bin
 * @param {string[]} args
 * @returns {Promise<{ stdout: string, stderr: string, code: number }>}
 */
function defaultExec(bin, args) {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: TIMEOUT_MS },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0;
        resolve({ stdout, stderr, code });
      },
    );
  });
}

/**
 * @param {{ root: string, exists?: (p: string) => boolean, exec?: typeof defaultExec, bin?: string }} options
 */
async function runSandboxTests({
  root,
  exists = fs.existsSync,
  exec = defaultExec,
  bin = process.execPath,
}) {
  const files = SANDBOX_TEST_FILES.map((f) => path.join(root, f));
  const missing = files.filter((f) => !exists(f));
  if (missing.length) {
    return { available: false, reason: `test files not found: ${missing.join(', ')}` };
  }
  const { stdout, stderr, code } = await exec(bin, ['--test', ...files]);
  const summary = parseTestSummary(stdout);
  return {
    available: true,
    passed: code === 0 && summary !== null && summary.fail === 0,
    summary,
    output: stdout + stderr,
    ranAt: new Date().toISOString(),
  };
}

module.exports = { parseTestSummary, runSandboxTests, SANDBOX_TEST_FILES };
