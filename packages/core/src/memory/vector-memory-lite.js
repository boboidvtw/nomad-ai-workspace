/**
 * Vector Memory Lite - Local Hybrid Semantic & BM25 Search Engine
 * Zero-dependency, lightweight in-memory vector & keyword indexing.
 * Governed by AGENTS.md Section 6: Atomic Contract & Result Pattern.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

/**
 * Tokenize text into normalized terms and character n-grams (for CJK & typo tolerance)
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();

  // Word tokens (Western)
  const words = lower.match(/[a-z0-9_\-\.]+/g) || [];

  // 2-gram and 3-gram tokens for CJK characters
  const ngrams = [];
  const cjkChars = lower.match(/[\u4e00-\u9fff]/g) || [];
  for (let i = 0; i < cjkChars.length - 1; i++) {
    ngrams.push(cjkChars[i] + cjkChars[i + 1]);
    if (i < cjkChars.length - 2) {
      ngrams.push(cjkChars[i] + cjkChars[i + 1] + cjkChars[i + 2]);
    }
  }

  return [...words, ...ngrams, ...cjkChars];
}

class VectorMemoryLite {
  constructor() {
    this.documents = new Map(); // id -> { id, title, content, metadata, tokens: Map<term, freq> }
    this.docCount = 0;
    this.termDocFreq = new Map(); // term -> number of docs containing term
  }

  /**
   * Add or update a document in the index
   * @param {Object} doc
   * @param {string} doc.id
   * @param {string} doc.title
   * @param {string} doc.content
   * @param {Object} [doc.metadata]
   * @returns {import('../result').UnitResult<{ indexedId: string, termsCount: number }>}
   */
  addDocument(doc = {}) {
    try {
      if (!doc.id || !doc.content) {
        return err(ErrorCodes.MEMORY_INDEX_FAILED_001, 'Document must have id and content');
      }

      // If document already exists, remove it first
      if (this.documents.has(doc.id)) {
        this.removeDocument(doc.id);
      }

      const text = `${doc.title || ''} ${doc.content}`;
      const tokens = tokenize(text);
      const termFreq = new Map();

      for (const t of tokens) {
        termFreq.set(t, (termFreq.get(t) || 0) + 1);
      }

      for (const term of termFreq.keys()) {
        this.termDocFreq.set(term, (this.termDocFreq.get(term) || 0) + 1);
      }

      this.documents.set(doc.id, {
        id: doc.id,
        title: doc.title || '',
        content: doc.content,
        metadata: doc.metadata || {},
        termFreq,
        length: tokens.length
      });

      this.docCount++;
      return ok({ indexedId: doc.id, termsCount: termFreq.size });
    } catch (e) {
      return err(ErrorCodes.MEMORY_INDEX_FAILED_001, 'Index error: ' + e.message);
    }
  }

  removeDocument(id) {
    if (!this.documents.has(id)) return false;
    const doc = this.documents.get(id);
    for (const term of doc.termFreq.keys()) {
      const current = this.termDocFreq.get(term) || 1;
      if (current <= 1) {
        this.termDocFreq.delete(term);
      } else {
        this.termDocFreq.set(term, current - 1);
      }
    }
    this.documents.delete(id);
    this.docCount--;
    return true;
  }

  /**
   * Hybrid query scoring using BM25-TFIDF heuristic
   * @param {string} queryText
   * @param {Object} [options]
   * @param {number} [options.limit=10]
   * @returns {import('../result').UnitResult<Array<{ id: string, title: string, score: number, snippet: string, metadata: Object }>>}
   */
  search(queryText, options = {}) {
    try {
      if (typeof queryText !== 'string' || !queryText.trim()) {
        return ok([]);
      }

      const queryTokens = tokenize(queryText);
      if (queryTokens.length === 0 || this.docCount === 0) {
        return ok([]);
      }

      const scores = new Map();
      const avgLength = Array.from(this.documents.values()).reduce((sum, d) => sum + d.length, 0) / this.docCount || 1;
      const k1 = 1.2;
      const b = 0.75;

      for (const token of queryTokens) {
        const docFreq = this.termDocFreq.get(token) || 0;
        if (docFreq === 0) continue;

        // IDF calculation
        const idf = Math.log((this.docCount - docFreq + 0.5) / (docFreq + 0.5) + 1);

        for (const [docId, doc] of this.documents.entries()) {
          const tf = doc.termFreq.get(token) || 0;
          if (tf === 0) continue;

          // BM25 term score
          const numerator = tf * (k1 + 1);
          const denominator = tf + k1 * (1 - b + b * (doc.length / avgLength));
          const termScore = idf * (numerator / denominator);

          scores.set(docId, (scores.get(docId) || 0) + termScore);
        }
      }

      // Format results
      const results = [];
      for (const [docId, score] of scores.entries()) {
        const doc = this.documents.get(docId);
        // Extract simple snippet around best match
        const snippet = doc.content.slice(0, 160) + (doc.content.length > 160 ? '...' : '');
        results.push({
          id: doc.id,
          title: doc.title,
          score: Number(score.toFixed(3)),
          snippet,
          metadata: doc.metadata
        });
      }

      results.sort((a, b) => b.score - a.score);
      const limit = options.limit || 10;
      return ok(results.slice(0, limit));
    } catch (e) {
      return err(ErrorCodes.MEMORY_QUERY_FAILED_002, 'Search query error: ' + e.message);
    }
  }

  clear() {
    this.documents.clear();
    this.termDocFreq.clear();
    this.docCount = 0;
  }
}

module.exports = {
  tokenize,
  VectorMemoryLite
};
