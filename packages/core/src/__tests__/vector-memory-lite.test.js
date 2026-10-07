const { test } = require('node:test');
const assert = require('node:assert');
const { VectorMemoryLite, tokenize, isOk } = require('../../index');

test('VectorMemoryLite: tokenizes mixed Western & CJK n-grams', () => {
  const tokens = tokenize('Fast Redis 緩存優化');
  assert.ok(tokens.includes('fast'));
  assert.ok(tokens.includes('redis'));
  assert.ok(tokens.includes('緩存'));
  assert.ok(tokens.includes('存優'));
  assert.ok(tokens.includes('優化'));
});

test('VectorMemoryLite: indexes documents and retrieves top BM25 matches', () => {
  const mem = new VectorMemoryLite();

  mem.addDocument({
    id: 'doc-1',
    title: 'PostgreSQL 效能調優指南',
    content: '針對高併發資料庫查詢進行索引優化與連線池管理。',
  });

  mem.addDocument({
    id: 'doc-2',
    title: 'React 前端元件最佳實踐',
    content: '使用 React Hooks 與 Virtual DOM 降低重新渲染開銷。',
  });

  const queryRes = mem.search('資料庫 索引優化');
  assert.strictEqual(isOk(queryRes), true);
  assert.strictEqual(queryRes.data.length, 1);
  assert.strictEqual(queryRes.data[0].id, 'doc-1');
  assert.ok(queryRes.data[0].score > 0);
});
