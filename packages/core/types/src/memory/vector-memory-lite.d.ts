/**
 * Tokenize text into normalized terms and character n-grams (for CJK & typo tolerance)
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text: string): string[];
export class VectorMemoryLite {
    documents: Map<any, any>;
    docCount: number;
    termDocFreq: Map<any, any>;
    /**
     * Add or update a document in the index
     * @param {Object} [doc] - `id` and `content` are required; validated at runtime
     * @param {string} [doc.id]
     * @param {string} [doc.title]
     * @param {string} [doc.content]
     * @param {Object} [doc.metadata]
     * @returns {import('../result').UnitResult<{ indexedId: string, termsCount: number }>}
     */
    addDocument(doc?: {
        id?: string | undefined;
        title?: string | undefined;
        content?: string | undefined;
        metadata?: any;
    }): import("../result").UnitResult<{
        indexedId: string;
        termsCount: number;
    }>;
    removeDocument(id: any): boolean;
    /**
     * Hybrid query scoring using BM25-TFIDF heuristic
     * @param {string} queryText
     * @param {Object} [options]
     * @param {number} [options.limit=10]
     * @returns {import('../result').UnitResult<Array<{ id: string, title: string, score: number, snippet: string, metadata: Object }>>}
     */
    search(queryText: string, options?: {
        limit?: number | undefined;
    }): import("../result").UnitResult<Array<{
        id: string;
        title: string;
        score: number;
        snippet: string;
        metadata: any;
    }>>;
    clear(): void;
}
