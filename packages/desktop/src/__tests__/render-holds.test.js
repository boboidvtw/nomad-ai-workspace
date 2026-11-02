const test = require('node:test');
const assert = require('node:assert');
const { createRenderHolds } = require('../render-holds.js');

test('render holds: a platform is held while its task runs and released after', async () => {
  /** @type {string[][]} */
  const seen = [];
  const holds = createRenderHolds(() => seen.push(holds.list()));

  const result = await holds.during('gemini', async () => {
    assert.deepStrictEqual(holds.list(), ['gemini']);
    return 'reply';
  });

  assert.strictEqual(result, 'reply');
  assert.deepStrictEqual(holds.list(), []);
  assert.deepStrictEqual(seen, [['gemini'], []]);
});

test('render holds: overlapping tasks on one platform keep it held until the last ends', async () => {
  const holds = createRenderHolds(() => {});
  /** @type {() => void} */
  let endFirst = () => {};
  const first = holds.during('gemini', () => new Promise((r) => (endFirst = () => r(undefined))));
  await holds.during('gemini', async () => {});

  assert.deepStrictEqual(holds.list(), ['gemini']);
  endFirst();
  await first;
  assert.deepStrictEqual(holds.list(), []);
});

test('render holds: a failing task still releases its hold', async () => {
  const holds = createRenderHolds(() => {});
  await assert.rejects(
    holds.during('grok', async () => {
      throw new Error('page crashed');
    }),
    /page crashed/,
  );
  assert.deepStrictEqual(holds.list(), []);
});
