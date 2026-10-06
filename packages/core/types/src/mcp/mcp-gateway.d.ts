export class McpGateway {
    constructor(options?: {});
    tools: Map<any, any>;
    servers: Map<any, any>;
    allowedPaths: any;
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
