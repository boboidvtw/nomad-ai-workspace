const test = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const { createServiceRunner } = require('../services/service-runner');

test('kill: a process that already exited counts as killed', () => {
  const runner = createServiceRunner(os.tmpdir());
  const original = process.kill;
  process.kill = () => {
    throw Object.assign(new Error('gone'), { code: 'ESRCH' });
  };
  try {
    assert.doesNotThrow(() => runner.kill(123, 'SIGKILL'));
  } finally {
    process.kill = original;
  }
});

test('kill: other errors, such as a missing permission, still surface', () => {
  const runner = createServiceRunner(os.tmpdir());
  const original = process.kill;
  process.kill = () => {
    throw Object.assign(new Error('denied'), { code: 'EPERM' });
  };
  try {
    assert.throws(() => runner.kill(123, 'SIGTERM'), /denied/);
  } finally {
    process.kill = original;
  }
});

/** Runs findPids in a child whose command line carries the marker, so the child matches. */
function findPidsInChild(/** @type {string} */ options) {
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const runnerPath = path.join(__dirname, '../services/service-runner');
  const script = `require(${JSON.stringify(runnerPath)}).createServiceRunner(require('os').tmpdir())
    .findPids('nomad-self-check-marker', ${options})
    .then((p) => console.log(JSON.stringify({ self: process.pid, found: p })));`;
  return JSON.parse(
    execFileSync(process.execPath, ['-e', script, 'nomad-self-check-marker'], { encoding: 'utf8' }),
  );
}

test('findPids: includeSelf finds the calling process (the Studio checks its own card)', () => {
  // macOS pgrep also leaves out its caller's ancestors unless given -a.
  const out = findPidsInChild('{ includeSelf: true }');
  assert.ok(out.found.includes(out.self), `expected ${out.self} in ${out.found}`);
});

test('findPids: leaves the calling process out by default, so a stop never kills the Studio', () => {
  const out = findPidsInChild('undefined');
  assert.ok(!out.found.includes(out.self));
});
