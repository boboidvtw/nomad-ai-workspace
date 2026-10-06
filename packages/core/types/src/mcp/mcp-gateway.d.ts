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
export type McpToolDefinition = {
    name: string;
    description?: string | undefined;
    /**
     * - JSON Schema of the tool arguments
     */
    parameters?: Record<string, unknown> | undefined;
    handler: (args: Record<string, any>) => Promise<import("../result").UnitResult<unknown>>;
};
/**
 * @typedef {Object} McpGatewayOptions
 * @property {string[]} [allowedPaths] - Roots the built-in file tools may read. Defaults to {@link defaultAllowedPaths}.
 * @property {string[]} [deniedPaths] - Locations refused even inside an allowed root. Defaults to {@link defaultDeniedPaths}.

 */
/**
 * @typedef {Object} McpToolDefinition
 * @property {string} name
 * @property {string} [description]
 * @property {Record<string, unknown>} [parameters] - JSON Schema of the tool arguments
 * @property {(args: Record<string, any>) => Promise<import('../result').UnitResult<unknown>>} handler
 */
export class McpGateway {
    /**
     * @param {McpGatewayOptions} [options]
     */
    constructor(options?: McpGatewayOptions);
    /** @type {Map<string, McpToolDefinition>} */
    tools: Map<string, McpToolDefinition>;
    /** @type {Map<string, unknown>} */
    servers: Map<string, unknown>;
    /** @type {string[]} */
    allowedPaths: string[];
    /** @type {string[]} */
    deniedPaths: string[];
    /**
     * Resolves a tool-supplied path and checks it against the allow/deny lists.
     * Relative paths are resolved against the first allowed root.
     * @param {unknown} requestedPath
     * @returns {import('../result').UnitResult<string, typeof ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002>}
     */
    resolveAllowedPath(requestedPath: unknown): import("../result").UnitResult<string, typeof ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002>;
    registerDefaultTools(): void;
    /**
     * @param {McpToolDefinition} toolDef
     */
    registerTool(toolDef: McpToolDefinition): import("../result").UnitFailure<"MCP_INVALID_PROTOCOL_003"> | import("../result").UnitSuccess<{
        registeredTool: string;
    }>;
    listTools(): import("../result").UnitSuccess<{
        name: string;
        description: string | undefined;
        parameters: Record<string, unknown> | undefined;
    }[]>;
    /**
     * @param {string} name
     * @param {Record<string, any>} [args]
     */
    callTool(name: string, args?: Record<string, any>): Promise<import("../result").UnitResult<unknown, string>>;
}
/** Env var listing extra allowed roots for the built-in file tools, separated by `path.delimiter`. */
export const ALLOWED_PATHS_ENV: "NOMAD_MCP_ALLOWED_PATHS";
/**
 * Allowed roots when none are passed explicitly: `NOMAD_MCP_ALLOWED_PATHS` if set,
 * else `fallback` if given (e.g. an app-owned workspace dir), else the working
 * directory — unless that is the filesystem root (e.g. a packaged Electron app
 * launched from Finder), in which case nothing is allowed.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string[]} [fallback]
 * @returns {string[]}
 */
export function defaultAllowedPaths(env?: NodeJS.ProcessEnv, fallback?: string[]): string[];
/**
 * Credential / secret directories that stay off-limits even inside an allowed root.
 * @param {string} [homeDir]
 * @returns {string[]}
 */
export function defaultDeniedPaths(homeDir?: string): string[];
import { ErrorCodes } from "../error-codes";
