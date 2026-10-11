declare namespace _exports {
    export { ExecFileFn };
}
declare namespace _exports {
    export { AGENT_NAME_PATTERN as HERDR_AGENT_NAME_PATTERN };
    export { createHerdrRunner };
}
export = _exports;
type ExecFileFn = (file: string, args: string[], options?: Record<string, unknown>) => Promise<{
    stdout: string;
    stderr: string;
}>;
declare const AGENT_NAME_PATTERN: RegExp;
/**
 * @param {Object} [options]
 * @param {ExecFileFn} [options.execFile]
 * @param {string} [options.binary='herdr']
 * @param {number} [options.timeoutMs]
 * @param {number} [options.readLines]
 */
declare function createHerdrRunner(options?: {
    execFile?: ExecFileFn | undefined;
    binary?: string | undefined;
    timeoutMs?: number | undefined;
    readLines?: number | undefined;
}): {
    run: (bot: import("./bot-roster").Bot, text: string) => Promise<import("../result").UnitResult<{
        text: string;
    }>>;
    /** @returns {Promise<boolean>} */
    isAvailable(): Promise<boolean>;
};
