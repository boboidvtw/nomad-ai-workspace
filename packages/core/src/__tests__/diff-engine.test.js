const { test } = require('node:test');
const assert = require('node:assert');
const { computeDiff, isOk } = require('../../index');

test('DiffEngine: computes line-by-line diff and similarity ratio', () => {
  const textA = 'function hello() {\n  console.log("old");\n}';
  const textB = 'function hello() {\n  console.log("new");\n}';

  const res = computeDiff(textA, textB, { labelA: 'Claude', labelB: 'ChatGPT' });
  assert.strictEqual(isOk(res), true);
  assert.strictEqual(res.data.labelA, 'Claude');
  assert.strictEqual(res.data.labelB, 'ChatGPT');
  assert.strictEqual(res.data.stats.added, 1);
  assert.strictEqual(res.data.stats.deleted, 1);
  assert.ok(res.data.stats.similarityRatio > 0.5);

  const delChunk = res.data.lines.find(l => l.type === 'del');
  assert.ok(delChunk.value.includes('old'));
  const addChunk = res.data.lines.find(l => l.type === 'add');
  assert.ok(addChunk.value.includes('new'));
});
