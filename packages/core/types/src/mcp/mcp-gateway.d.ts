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
 * @typedef {Object} McpToolDefinition
 * @property {string} name
 * @property {string} [description]
 * @property {Record<string, unknown>} [parameters] - JSON Schema of the tool arguments
 * @property {(args: Record<string, any>) => Promise<import('../result').UnitResult<unknown>>} handler
 */
export class McpGateway {
    /**
     * @param {Object} [options]
     * @param {string[]} [options.allowedPaths]
     */
    constructor(options?: {
        allowedPaths?: string[] | undefined;
    });
    /** @type {Map<string, McpToolDefinition>} */
    tools: Map<string, McpToolDefinition>;
    /** @type {Map<string, unknown>} */
    servers: Map<string, unknown>;
    allowedPaths: string[];
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
