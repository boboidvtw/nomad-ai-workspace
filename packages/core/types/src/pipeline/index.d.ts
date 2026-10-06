import { estimateTokens } from "./headroom";
import { compress } from "./headroom";
import { decide } from "./laya";
export class PipelineManager {
    constructor(options?: {});
    headroomEnabled: boolean;
    layaEnabled: boolean;
    compressionLevel: any;
    autoEnhance: boolean;
    maxTokens: number;
    stats: {
        totalProcessed: number;
        totalSavedTokens: number;
        totalLayaLatencyMs: number;
        intents: {};
    };
    /**
     * Process prompt & context through the full pipeline
     * @param {Object} [input] - `prompt` is required; validated at runtime
     * @param {string} [input.prompt] - User query or directive
     * @param {string} [input.context] - Background conversational history or system context
     * @param {Object} [input.options]
     * @returns {import('../result').UnitResult<Object>}
     */
    process(input?: {
        prompt?: string | undefined;
        context?: string | undefined;
        options?: any;
    }): import("../result").UnitResult<any>;
    getStats(): {
        avgLayaLatencyMs: number;
        totalProcessed: number;
        totalSavedTokens: number;
        totalLayaLatencyMs: number;
        intents: {};
    };
}
export { estimateTokens, compress, decide };
