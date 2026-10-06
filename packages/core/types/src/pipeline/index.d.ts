import { estimateTokens } from "./headroom";
import { compress } from "./headroom";
import { decide } from "./laya";
export class PipelineManager {
    /**
     * @param {Object} [options]
     * @param {boolean} [options.headroomEnabled=true]
     * @param {boolean} [options.layaEnabled=true]
     * @param {'light'|'balanced'|'aggressive'} [options.compressionLevel='balanced']
     * @param {boolean} [options.autoEnhance=false]
     * @param {number} [options.maxTokens=8000]
     */
    constructor(options?: {
        headroomEnabled?: boolean | undefined;
        layaEnabled?: boolean | undefined;
        compressionLevel?: "light" | "balanced" | "aggressive" | undefined;
        autoEnhance?: boolean | undefined;
        maxTokens?: number | undefined;
    });
    headroomEnabled: boolean;
    layaEnabled: boolean;
    compressionLevel: "light" | "balanced" | "aggressive";
    autoEnhance: boolean;
    maxTokens: number;
    stats: {
        totalProcessed: number;
        totalSavedTokens: number;
        totalLayaLatencyMs: number;
        intents: Record<string, number>;
    };
    /**
     * Process prompt & context through the full pipeline
     * @param {Object} [input] - `prompt` is required; validated at runtime
     * @param {string} [input.prompt] - User query or directive
     * @param {string} [input.context] - Background conversational history or system context
     * @param {{ headroom?: boolean, compressionLevel?: 'light'|'balanced'|'aggressive', maxTokens?: number, laya?: boolean, enhance?: boolean, preferredPlatform?: string }} [input.options]
     * @returns {import('../result').UnitResult<{ pipelineId: string, originalPrompt: string, processedPrompt: string, headroom: unknown, laya: unknown, timestamp: string }>}
     */
    process(input?: {
        prompt?: string | undefined;
        context?: string | undefined;
        options?: {
            headroom?: boolean;
            compressionLevel?: "light" | "balanced" | "aggressive";
            maxTokens?: number;
            laya?: boolean;
            enhance?: boolean;
            preferredPlatform?: string;
        } | undefined;
    }): import("../result").UnitResult<{
        pipelineId: string;
        originalPrompt: string;
        processedPrompt: string;
        headroom: unknown;
        laya: unknown;
        timestamp: string;
    }>;
    getStats(): {
        avgLayaLatencyMs: number;
        totalProcessed: number;
        totalSavedTokens: number;
        totalLayaLatencyMs: number;
        intents: Record<string, number>;
    };
}
export { estimateTokens, compress, decide };
