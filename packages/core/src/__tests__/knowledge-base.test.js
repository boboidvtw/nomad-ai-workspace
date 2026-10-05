const { test } = require('node:test');
const assert = require('node:assert');
const { KnowledgeBase, isOk } = require('../../index');

test('KnowledgeBase: chunks document and retrieves context for prompt', () => {
  const kb = new KnowledgeBase({ chunkSize: 100, chunkOverlap: 20 });

  const doc = {
    id: 'nomad-architecture-doc',
    title: 'Nomad 架構規格書',
    content: 'Nomad 採用 Monorepo 組織體系。包含核心庫 Core、背景 Daemon 守護進程、本機決策儀表板 Dashboard 與 Nomad AI Studio 桌面工作站。系統支援六分欄與圓桌協作機制。'
  };

  const addRes = kb.addDocument(doc);
  assert.strictEqual(isOk(addRes), true);
  assert.ok(addRes.data.chunksIndexed >= 1);

  const retRes = kb.retrieve('Monorepo 組織體系架構');
  assert.strictEqual(isOk(retRes), true);
  assert.ok(retRes.data.chunks.length >= 1);
  assert.ok(retRes.data.injectedContext.includes('Nomad 本機知識庫檢索上下文'));
  assert.ok(retRes.data.injectedContext.includes('Monorepo'));
});
