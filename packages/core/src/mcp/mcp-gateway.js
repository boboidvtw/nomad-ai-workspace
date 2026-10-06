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

/** Env var listing extra allowed roots for the built-in file tools, separated by `path.delimiter`. */
const ALLOWED_PATHS_ENV = 'NOMAD_MCP_ALLOWED_PATHS';

/**
 * Credential / secret directories that stay off-limits even inside an allowed root.
 * @param {string} [homeDir]
 * @returns {string[]}
 */
function defaultDeniedPaths(homeDir = os.homedir()) {
  return ['.ssh', '.aws', '.gnupg', '.nomad'].map(name => path.join(homeDir, name));
}

/**
 * Allowed roots when none are passed explicitly: `NOMAD_MCP_ALLOWED_PATHS` if set,
 * otherwise the working directory — unless that is the filesystem root (e.g. a
 * packaged Electron app launched from Finder), in which case nothing is allowed.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function defaultAllowedPaths(env = process.env) {
  const fromEnv = (env[ALLOWED_PATHS_ENV] || '')
    .split(path.delimiter)
    .map(p => p.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  const cwd = path.resolve(process.cwd());
  return cwd === path.parse(cwd).root ? [] : [cwd];
}

/**
 * Canonicalises a path, following symlinks and `..`. For a path that does not exist
 * (yet), the nearest existing ancestor is resolved and the remainder re-appended, so
 * a dangling name under a symlinked directory still maps to its real location.
 * @param {string} target
 * @returns {string}
 */
function realpathLoose(target) {
  const absolute = path.resolve(target);
  /** @type {string[]} */
  const missing = [];
  let current = absolute;
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...missing);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return absolute;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * @param {string} child
 * @param {string} parent
 * @returns {boolean}
 */
function isWithin(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * @typedef {Object} McpGatewayOptions
 * @property {string[]} [allowedPaths] - Roots the built-in file tools may read. Defaults to {@link defaultAllowedPaths}.
 * @property {string[]} [deniedPaths] - Locations refused even inside an allowed root. Defaults to {@link defaultDeniedPaths}.
 */

class McpGateway {
  /**
   * @param {McpGatewayOptions} [options]
   */
  constructor(options = {}) {
    this.tools = new Map();
    this.servers = new Map();
    /** @type {string[]} */
    this.allowedPaths = options.allowedPaths || defaultAllowedPaths();
    /** @type {string[]} */
    this.deniedPaths = options.deniedPaths || defaultDeniedPaths();
    this.registerDefaultTools();
  }

  /**
   * Resolves a tool-supplied path and checks it against the allow/deny lists.
   * @param {unknown} requestedPath
   * @returns {import('../result').UnitResult<string, typeof ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002>}
   */
  resolveAllowedPath(requestedPath) {
    if (typeof requestedPath !== 'string' || requestedPath.length === 0) {
      return err(ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002, 'Path must be a non-empty string');
    }
    const resolved = realpathLoose(requestedPath);
    if (this.deniedPaths.some(denied => isWithin(resolved, realpathLoose(denied)))) {
      return err(ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002, `Access to sensitive path denied: ${requestedPath}`);
    }
    if (!this.allowedPaths.some(root => isWithin(resolved, realpathLoose(root)))) {
      return err(ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002, `Path is outside allowed roots: ${requestedPath}`);
    }
    return ok(resolved);
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
      handler: async (args) => {
        const checked = this.resolveAllowedPath(args.path);
        if (!checked.success) return checked;
        const filePath = checked.data;
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
      handler: async (args) => {
        const checked = this.resolveAllowedPath(args.path);
        if (!checked.success) return checked;
        const dirPath = checked.data;
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

  async callTool(name, args = {}) {
    const tool = this.tools.get(name);
    if (!tool) {
      return err(ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002, `MCP tool not found: ${name}`);
    }
    try {
      return await tool.handler(args);
    } catch (e) {
      return err(ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002, `Tool ${name} failed: ${e.message}`);
    }
  }
}

module.exports = {
  McpGateway,
  ALLOWED_PATHS_ENV,
  defaultAllowedPaths,
  defaultDeniedPaths
};
