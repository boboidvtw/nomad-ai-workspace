/**
 * Picks the roots the desktop app's MCP file tools may read.
 * A packaged app is launched with cwd `/`, so it gets an app-owned workspace
 * directory under userData instead; dev runs keep the core default (cwd).
 * `NOMAD_MCP_ALLOWED_PATHS` overrides both.
 */

const fs = require('fs');
const path = require('path');
const { defaultAllowedPaths } = require('@nomad/core');

/**
 * @param {{ isPackaged: boolean, userDataDir: string, env?: NodeJS.ProcessEnv }} options
 * @returns {string[]}
 */
function resolveMcpAllowedPaths({ isPackaged, userDataDir, env = process.env }) {
  if (!isPackaged) return defaultAllowedPaths(env);
  const workspaceDir = path.join(userDataDir, 'workspace');
  try {
    fs.mkdirSync(workspaceDir, { recursive: true });
  } catch (e) {
    console.warn('[mcp] cannot create workspace dir', workspaceDir, e);
  }
  return defaultAllowedPaths(env, [workspaceDir]);
}

module.exports = { resolveMcpAllowedPaths };
