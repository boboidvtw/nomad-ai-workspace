const test = require('node:test');
const assert = require('node:assert');
const { parseTestSummary, runSandboxTests, SANDBOX_TEST_FILES } = require('../sandbox-gate.js');

// Literal node --test summary tails, copied from real runs.
const GREEN = 'ℹ tests 12\nℹ suites 0\nℹ pass 12\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n';
const RED = 'ℹ tests 12\nℹ pass 10\nℹ fail 2\nℹ cancelled 0\nℹ skipped 0\n';

test('Sandbox gate: parseTestSummary reads counts from a green run', () => {
  assert.deepStrictEqual(parseTestSummary(GREEN), { total: 12, pass: 12, fail: 0, skipped: 0 });
});

test('Sandbox gate: parseTestSummary reads counts from a failing run', () => {
  assert.deepStrictEqual(parseTestSummary(RED), { total: 12, pass: 10, fail: 2, skipped: 0 });
});

test('Sandbox gate: parseTestSummary returns null when there is no summary', () => {
  assert.strictEqual(parseTestSummary('SyntaxError: Unexpected token'), null);
});

test('Sandbox gate: reports unavailable when the test files are not shipped', async () => {
  const res = await runSandboxTests({ root: '/nonexistent', exists: () => false });
  assert.strictEqual(res.available, false);
  assert.match(res.reason, /not found/);
});

test('Sandbox gate: runs the listed files and reports a green gate', async () => {
  /** @type {string[][]} */
  const calls = [];
  const res = await runSandboxTests({
    root: '/repo/packages',
    exists: () => true,
    exec: async (_bin, args) => {
      calls.push(args);
      return { stdout: GREEN, stderr: '', code: 0 };
    },
  });
  assert.strictEqual(res.available, true);
  assert.strictEqual(res.passed, true);
  assert.deepStrictEqual(res.summary, { total: 12, pass: 12, fail: 0, skipped: 0 });
  assert.deepStrictEqual(calls[0].slice(0, 1), ['--test']);
  assert.strictEqual(calls[0].length, 1 + SANDBOX_TEST_FILES.length);
});

test('Sandbox gate: a non-zero exit fails the gate even if the summary looks fine', async () => {
  const res = await runSandboxTests({
    root: '/repo/packages',
    exists: () => true,
    exec: async () => ({ stdout: GREEN, stderr: '', code: 1 }),
  });
  assert.strictEqual(res.passed, false);
});

test('Sandbox gate: output without a summary is not a pass', async () => {
  const res = await runSandboxTests({
    root: '/repo/packages',
    exists: () => true,
    exec: async () => ({ stdout: 'crashed', stderr: '', code: 0 }),
  });
  assert.strictEqual(res.passed, false);
  assert.strictEqual(res.summary, null);
});
