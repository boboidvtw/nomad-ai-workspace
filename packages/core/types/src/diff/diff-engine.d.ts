/**
 * Compute side-by-side or unified diff between two texts
 * @param {string} textA - Original text (e.g. Claude perspective)
 * @param {string} textB - Modified text (e.g. ChatGPT perspective)
 * @param {Object} [options]
 * @param {string} [options.labelA='Perspective A']
 * @param {string} [options.labelB='Perspective B']
 * @returns {import('../result').UnitResult<{ lines: Array<{ type: 'equal'|'add'|'del', value: string, lineA?: number, lineB?: number }>, stats: { added: number, deleted: number, unchanged: number, similarityRatio: number }, labelA: string, labelB: string }>}
 */
export function computeDiff(textA: string, textB: string, options?: {
    labelA?: string | undefined;
    labelB?: string | undefined;
}): import("../result").UnitResult<{
    lines: Array<{
        type: "equal" | "add" | "del";
        value: string;
        lineA?: number;
        lineB?: number;
    }>;
    stats: {
        added: number;
        deleted: number;
        unchanged: number;
        similarityRatio: number;
    };
    labelA: string;
    labelB: string;
}>;
