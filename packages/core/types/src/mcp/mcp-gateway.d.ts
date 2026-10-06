export type McpGatewayOptions = {
    /**
     * - Roots the built-in file tools may read. Defaults to {@link defaultAllowedPaths}.
     */
    allowedPaths?: string[] | undefined;
    /**
     * - Locations refused even inside an allowed root. Defaults to {@link defaultDeniedPaths}.
     */
    deniedPaths?: string[] | undefined;
};
/**
 * @typedef {Object} McpGatewayOptions
 * @property {string[]} [allowedPaths] - Roots the built-in file tools may read. Defaults to {@link defaultAllowedPaths}.
 * @property {string[]} [deniedPaths] - Locations refused even inside an allowed root. Defaults to {@link defaultDeniedPaths}.
 */
export class McpGateway {
    /**
     * @param {McpGatewayOptions} [options]
     */
    constructor(options?: McpGatewayOptions);
    tools: Map<any, any>;
    servers: Map<any, any>;
    /** @type {string[]} */
    allowedPaths: string[];
    /** @type {string[]} */
    deniedPaths: string[];
    /**
     * Resolves a tool-supplied path and checks it against the allow/deny lists.
     * @param {unknown} requestedPath
     * @returns {import('../result').UnitResult<string, typeof ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002>}
     */
    resolveAllowedPath(requestedPath: unknown): import("../result").UnitResult<string, typeof ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002>;
    registerDefaultTools(): void;
    registerTool(toolDef: any): import("../result").UnitFailure<"MCP_INVALID_PROTOCOL_003"> | import("../result").UnitSuccess<{
        registeredTool: any;
    }>;
    listTools(): import("../result").UnitSuccess<{
        name: any;
        description: any;
        parameters: any;
    }[]>;
    callTool(name: any, args?: {}): Promise<any>;
}
/** Env var listing extra allowed roots for the built-in file tools, separated by `path.delimiter`. */
export const ALLOWED_PATHS_ENV: "NOMAD_MCP_ALLOWED_PATHS";
/**
 * Allowed roots when none are passed explicitly: `NOMAD_MCP_ALLOWED_PATHS` if set,
 * otherwise the working directory — unless that is the filesystem root (e.g. a
 * packaged Electron app launched from Finder), in which case nothing is allowed.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function defaultAllowedPaths(env?: NodeJS.ProcessEnv): string[];
/**
 * Credential / secret directories that stay off-limits even inside an allowed root.
 * @param {string} [homeDir]
 * @returns {string[]}
 */
export function defaultDeniedPaths(homeDir?: string): string[];
import { ErrorCodes } from "../error-codes";
