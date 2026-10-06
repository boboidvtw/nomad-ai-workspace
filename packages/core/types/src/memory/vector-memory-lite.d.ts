/**
 * Tokenize text into normalized terms and character n-grams (for CJK & typo tolerance)
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text: string): string[];
export class VectorMemoryLite {
    /** @type {Map<string, { id: string, title: string, content: string, metadata: Record<string, unknown>, termFreq: Map<string, number>, length: number }>} */
    documents: Map<string, {
        id: string;
        title: string;
        content: string;
        metadata: Record<string, unknown>;
        termFreq: Map<string, number>;
        length: number;
    }>;
    docCount: number;
    /** @type {Map<string, number>} term -> number of docs containing term */
    termDocFreq: Map<string, number>;
    /**
     * Add or update a document in the index
     * @param {Object} [doc] - `id` and `content` are required; validated at runtime
     * @param {string} [doc.id]
     * @param {string} [doc.title]
     * @param {string} [doc.content]
     * @param {Record<string, unknown>} [doc.metadata]
     * @returns {import('../result').UnitResult<{ indexedId: string, termsCount: number }>}
     */
    addDocument(doc?: {
        id?: string | undefined;
        title?: string | undefined;
        content?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
    }): import("../result").UnitResult<{
        indexedId: string;
        termsCount: number;
    }>;
    /**
     * @param {string} id
     * @returns {boolean}
     */
    removeDocument(id: string): boolean;
    /**
     * Hybrid query scoring using BM25-TFIDF heuristic
     * @param {string} queryText
     * @param {Object} [options]
     * @param {number} [options.limit=10]
     * @returns {import('../result').UnitResult<Array<{ id: string, title: string, score: number, snippet: string, metadata: Record<string, unknown> }>>}
     */
    search(queryText: string, options?: {
        limit?: number | undefined;
    }): import("../result").UnitResult<Array<{
        id: string;
        title: string;
        score: number;
        snippet: string;
        metadata: Record<string, unknown>;
    }>>;
    clear(): void;
}
