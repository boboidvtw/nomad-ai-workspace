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
