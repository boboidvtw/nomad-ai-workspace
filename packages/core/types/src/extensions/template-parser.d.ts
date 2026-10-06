export type TemplateVariable = {
    name: string;
    defaultValue: string;
};
/**
 * Extracts all unique variable names and defaults from a prompt template.
 * @param {string} template
 * @returns {import('../result').UnitResult<TemplateVariable[]>}
 */
export function extractVariables(template: string): import("../result").UnitResult<TemplateVariable[]>;
/**
 * Interpolates values into the template safely.
 * @param {string} template
 * @param {Record<string, string>} values
 * @returns {import('../result').UnitResult<{ rendered: string, unreplaced: string[] }>}
 */
export function interpolate(template: string, values?: Record<string, string>): import("../result").UnitResult<{
    rendered: string;
    unreplaced: string[];
}>;
