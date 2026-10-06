/**
 * Model Context Protocol (MCP) Host & Gateway
 * Implements JSON-RPC 2.0 tool execution and resource connector.
 * Governed by AGENTS.md Section 6: Atomic Contract & Result Pattern.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

/**
 * @typedef {Object} McpToolDefinition
 * @property {string} name
 * @property {string} [description]
 * @property {Record<string, unknown>} [parameters] - JSON Schema of the tool arguments
 * @property {(args: Record<string, any>) => Promise<import('../result').UnitResult<unknown>>} handler
 */

class McpGateway {
  /**
   * @param {Object} [options]
   * @param {string[]} [options.allowedPaths]
   */
  constructor(options = {}) {
    /** @type {Map<string, McpToolDefinition>} */
    this.tools = new Map();
    /** @type {Map<string, unknown>} */
    this.servers = new Map();
    this.allowedPaths = options.allowedPaths || [process.cwd(), os.homedir()];
    this.registerDefaultTools();
  }

  registerDefaultTools() {
    // Tool 1: read_file
    this.registerTool({
      name: 'read_file',
      description: '讀取本機工作區指定文字檔案',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '本機檔案絕對路徑' }
        },
        required: ['path']
      },
      handler: async (/** @type {Record<string, any>} */ args) => {
        const filePath = args.path;
        if (!fs.existsSync(filePath)) {
          return err(ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002, `File does not exist: ${filePath}`);
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        return ok({ path: filePath, content: content.slice(0, 10000), truncated: content.length > 10000 });
      }
    });

    // Tool 2: list_directory
    this.registerTool({
      name: 'list_directory',
      description: '列出本機指定目錄之子檔案與子目錄清單',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目錄絕對路徑' }
        },
        required: ['path']
      },
      handler: async (/** @type {Record<string, any>} */ args) => {
        const dirPath = args.path;
        if (!fs.existsSync(dirPath)) {
          return err(ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002, `Directory does not exist: ${dirPath}`);
        }
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const items = entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file'
        }));
        return ok({ path: dirPath, items: items.slice(0, 100) });
      }
    });
  }

  /**
   * @param {McpToolDefinition} toolDef
   */
  registerTool(toolDef) {
    if (!toolDef || !toolDef.name || typeof toolDef.handler !== 'function') {
      return err(ErrorCodes.MCP_INVALID_PROTOCOL_003, 'Invalid tool definition');
    }
    this.tools.set(toolDef.name, toolDef);
    return ok({ registeredTool: toolDef.name });
  }

  listTools() {
    const list = Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
    return ok(list);
  }

  /**
   * @param {string} name
   * @param {Record<string, any>} [args]
   */
  async callTool(name, args = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      return err(ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002, `MCP tool not found: ${name}`);
    }
    try {
      return await tool.handler(args);
    } catch (e) {
      return err(ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002, `Tool ${name} failed: ${(e instanceof Error ? e.message : String(e))}`);
    }
  }
}

module.exports = {
  McpGateway
};
