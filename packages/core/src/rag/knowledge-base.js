/**
 * Local Knowledge Base & RAG Pipeline
 * Indexes local files and injects top semantic context into prompts.
 * Governed by AGENTS.md Section 6: Atomic Contract & Result Pattern.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { VectorMemoryLite } = require('../memory/vector-memory-lite');

class KnowledgeBase {
  /**
   * @param {Object} [options]
   * @param {number} [options.chunkSize=350]
   * @param {number} [options.chunkOverlap=50]
   */
  constructor(options = {}) {
    this.chunkSize = options.chunkSize || 350;
    this.chunkOverlap = options.chunkOverlap || 50;
    this.memory = new VectorMemoryLite();
    this.indexedSources = new Set();
  }

  /**
   * Chunk text content into overlapping semantic segments
   * @param {string} text
   * @returns {string[]}
   */
  chunkText(text) {
    if (!text || typeof text !== 'string') return [];
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + this.chunkSize, text.length);
      chunks.push(text.slice(start, end).trim());
      if (end >= text.length) break;
      start += (this.chunkSize - this.chunkOverlap);
    }

    return chunks.filter(c => c.length > 10);
  }

  /**
   * Ingest a document into the knowledge base
   * @param {Object} doc
   * @param {string} doc.id - Document identifier
   * @param {string} doc.title - Document name or path
   * @param {string} doc.content - Full text content
   * @returns {import('../result').UnitResult<{ docId: string, chunksIndexed: number }>}
   */
  addDocument(doc = {}) {
    try {
      const content = doc.content || doc.text;
      if (!doc.id || !content) {
        return err(ErrorCodes.RAG_DOCUMENT_READ_FAILED_001, 'Document id and content required');
      }
      doc.content = content;

      const chunks = this.chunkText(doc.content);
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = `${doc.id}#chunk-${i + 1}`;
        this.memory.addDocument({
          id: chunkId,
          title: `${doc.title || doc.id} (片段 ${i + 1}/${chunks.length})`,
          content: chunks[i],
          metadata: { docId: doc.id, chunkIndex: i, totalChunks: chunks.length }
        });
      }

      this.indexedSources.add(doc.id);
      return ok({ docId: doc.id, chunksIndexed: chunks.length });
    } catch (e) {
      return err(ErrorCodes.RAG_CHUNKING_FAILED_002, 'Failed to chunk and index doc: ' + e.message);
    }
  }

  /**
   * Retrieve relevant context chunks for a prompt
   * @param {string} query
   * @param {number} [topK=3]
   * @returns {import('../result').UnitResult<{ chunks: Array<{ title: string, content: string, score: number }>, injectedContext: string }>}
   */
  retrieveContext(query, topK = 3) {
    return this.retrieve(query, topK);
  }

  retrieve(query, topK = 3) {
    const searchRes = this.memory.search(query, { limit: topK });
    if (!searchRes.success) return searchRes;

    const chunks = searchRes.data.map(r => ({
      title: r.title,
      content: r.snippet,
      score: r.score
    }));

    if (chunks.length === 0) {
      return ok({ chunks: [], injectedContext: '' });
    }

    const injected = chunks.map((c, idx) => `[本機知識參考 #${idx + 1} - ${c.title}]:\n${c.content}`).join('\n\n');

    return ok({
      chunks,
      injectedContext: `> 📚 [Nomad 本機知識庫檢索上下文]:\n${injected}`
    });
  }
}

module.exports = {
  KnowledgeBase
};
