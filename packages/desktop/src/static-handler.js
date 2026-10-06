/**
 * Nomad Core Daemon - Static Handler for Nomad Dashboard
 */

const fs = require('fs');
const path = require('path');
let err = null;
let ErrorCodes = null;
try {
  const core = require('@nomad/core');
  err = core.err;
  ErrorCodes = core.ErrorCodes;
} catch (e) {
  try {
    const core = require('@nomad/core');
    err = core.err;
    ErrorCodes = core.ErrorCodes;
  } catch (e2) {
    err = (code, msg) => ({ success: false, errorCode: code, message: msg });
    ErrorCodes = { DASHBOARD_FILE_NOT_FOUND_001: 'DASHBOARD_FILE_NOT_FOUND_001', DASHBOARD_READ_FAILED_002: 'DASHBOARD_READ_FAILED_002' };
  }
}

const DASHBOARD_PATHS = [
  path.resolve(__dirname, 'dashboard-fallback.html'),
  path.resolve(__dirname, '../../dashboard/index.html'),
  path.resolve(__dirname, '../../../nomad-dashboard/index.html'),
  path.resolve('/Users/liyungchih-macstudio/Developer/nomad-dashboard/index.html')
];

/**
 * Finds the valid index.html path for Nomad Dashboard
 * @returns {string|null}
 */
function findDashboardPath() {
  for (const p of DASHBOARD_PATHS) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

/**
 * Serves the dashboard HTML file
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {(html: string) => string} [transform] - Optional HTML rewrite (e.g. auth token injection)
 */
function serveDashboard(req, res, transform) {
  const filePath = findDashboardPath();
  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(err(
      ErrorCodes.DASHBOARD_FILE_NOT_FOUND_001,
      'Nomad Dashboard index.html not found on system'
    )));
    return;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const content = typeof transform === 'function' ? transform(raw) : raw;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(content),
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(err(
      ErrorCodes.DASHBOARD_READ_FAILED_002,
      'Failed to read Nomad Dashboard file',
      { error: error instanceof Error ? error.message : String(error) }
    )));
  }
}

module.exports = {
  findDashboardPath,
  serveDashboard
};
