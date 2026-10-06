export class KnowledgeBase {
    /**
     * @param {Object} [options]
     * @param {number} [options.chunkSize=350]
     * @param {number} [options.chunkOverlap=50]
     */
    constructor(options?: {
        chunkSize?: number | undefined;
        chunkOverlap?: number | undefined;
    });
    chunkSize: number;
    chunkOverlap: number;
    memory: VectorMemoryLite;
    indexedSources: Set<any>;
    /**
     * Chunk text content into overlapping semantic segments
     * @param {string} text
     * @returns {string[]}
     */
    chunkText(text: string): string[];
    /**
     * Ingest a document into the knowledge base
     * @param {Object} [doc] - `id` and `content` (or `text`) are required; validated at runtime
     * @param {string} [doc.id] - Document identifier
     * @param {string} [doc.title] - Document name or path
     * @param {string} [doc.content] - Full text content
     * @param {string} [doc.text] - Alias of `content`
     * @returns {import('../result').UnitResult<{ docId: string, chunksIndexed: number }>}
     */
    addDocument(doc?: {
        id?: string | undefined;
        title?: string | undefined;
        content?: string | undefined;
        text?: string | undefined;
    }): import("../result").UnitResult<{
        docId: string;
        chunksIndexed: number;
    }>;
    /**
     * Retrieve relevant context chunks for a prompt
     * @param {string} query
     * @param {number} [topK=3]
     * @returns {import('../result').UnitResult<{ chunks: Array<{ title: string, content: string, score: number }>, injectedContext: string }>}
     */
    retrieveContext(query: string, topK?: number): import("../result").UnitResult<{
        chunks: Array<{
            title: string;
            content: string;
            score: number;
        }>;
        injectedContext: string;
    }>;
    /**
     * @param {string} query
     * @param {number} [topK=3]
     * @returns {import('../result').UnitResult<{ chunks: Array<{ title: string, content: string, score: number }>, injectedContext: string }>}
     */
    retrieve(query: string, topK?: number): import("../result").UnitResult<{
        chunks: Array<{
            title: string;
            content: string;
            score: number;
        }>;
        injectedContext: string;
    }>;
}
import { VectorMemoryLite } from "../memory/vector-memory-lite";
