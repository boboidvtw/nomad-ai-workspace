const test = require('node:test');
const assert = require('node:assert/strict');
const { ok, err, isOk, isErr, wrapAsync, ErrorCodes, MONITORED_SERVICES } = require('../../index');

test('Core Result: ok returns standard success structure', () => {
  const r = ok({ count: 42 });
  assert.equal(r.success, true);
  assert.deepEqual(r.data, { count: 42 });
  assert.equal(isOk(r), true);
  assert.equal(isErr(r), false);
});

test('Core Result: err returns standard error structure with namespaced code', () => {
  const r = err(ErrorCodes.DAEMON_SERVER_PORT_IN_USE_001, 'Port occupied', { port: 8765 });
  assert.equal(r.success, false);
  assert.equal(r.errorCode, 'DAEMON_SERVER_PORT_IN_USE_001');
  assert.equal(r.message, 'Port occupied');
  assert.deepEqual(r.details, { port: 8765 });
  assert.equal(isOk(r), false);
  assert.equal(isErr(r), true);
});

test('Core Result: wrapAsync catches thrown exceptions safely', async () => {
  const failure = await wrapAsync(async () => {
    throw new Error('Connection refused');
  }, ErrorCodes.PROBE_CHECK_FAILED_004);

  assert.equal(failure.success, false);
  assert.equal(failure.errorCode, 'PROBE_CHECK_FAILED_004');
  assert.equal(failure.message, 'Connection refused');

  const success = await wrapAsync(async () => ({ status: 'alive' }));
  assert.equal(success.success, true);
  assert.deepEqual(success.data, { status: 'alive' });
});

test('Core Constants: MONITORED_SERVICES contains essential port 8765 and dependencies', () => {
  assert.equal(Array.isArray(MONITORED_SERVICES), true);
  const p8765 = MONITORED_SERVICES.find(s => s.port === 8765);
  assert.ok(p8765, 'Gateway port 8765 must be listed');
  assert.equal(p8765.essential, true);
});
