/**
 * Fast millisecond intent decision & prompt enhancement
 * @param {string} prompt - Raw prompt string
 * @param {Object} [options]
 * @param {boolean} [options.enhance=false] - Whether to inject smart guidance directives
 * @param {string} [options.preferredPlatform] - User override platform preference
 * @returns {import('../result').UnitResult<{ intent: string, confidence: number, recommendedPlatform: string, tags: string[], originalPrompt: string, enhancedPrompt: string, enhanced: boolean, latencyMs: number }>}
 */
export function decide(prompt: string, options?: {
    enhance?: boolean | undefined;
    preferredPlatform?: string | undefined;
}): import("../result").UnitResult<{
    intent: string;
    confidence: number;
    recommendedPlatform: string;
    tags: string[];
    originalPrompt: string;
    enhancedPrompt: string;
    enhanced: boolean;
    latencyMs: number;
}>;
