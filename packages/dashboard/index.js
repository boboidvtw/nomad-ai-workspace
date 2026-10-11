/**
 * @nomad/dashboard - Single source of the Nomad Dashboard HTML and its static handler.
 * Served by both @nomad/daemon and the desktop Studio bridge.
 */

const fs = require('fs');
const path = require('path');
const { err, ErrorCodes } = require('@nomad/core');

const DASHBOARD_HTML_PATH = path.join(__dirname, 'index.html');
const BOTS_PANEL_PATH = path.join(__dirname, 'bots-panel.html');
const BOTS_PANEL_MARKER = '<!-- @nomad:bots-panel -->';

/**
 * Inlines the Bots panel (kept in its own file so index.html does not keep growing).
 * @param {string} html
 * @returns {string}
 */
function composeDashboard(html) {
  if (!html.includes(BOTS_PANEL_MARKER) || !fs.existsSync(BOTS_PANEL_PATH)) return html;
  const panel = fs.readFileSync(BOTS_PANEL_PATH, 'utf-8');
  return html.replace(BOTS_PANEL_MARKER, () => panel);
}

/**
 * Returns the dashboard index.html path, or null if it is missing from the install.
 * @returns {string|null}
 */
function findDashboardPath() {
  return fs.existsSync(DASHBOARD_HTML_PATH) ? DASHBOARD_HTML_PATH : null;
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
    res.end(
      JSON.stringify(
        err(
          ErrorCodes.DASHBOARD_FILE_NOT_FOUND_001,
          'Nomad Dashboard index.html not found on system',
        ),
      ),
    );
    return;
  }

  try {
    const raw = composeDashboard(fs.readFileSync(filePath, 'utf-8'));
    const content = typeof transform === 'function' ? transform(raw) : raw;
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(content),
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify(
        err(ErrorCodes.DASHBOARD_READ_FAILED_002, 'Failed to read Nomad Dashboard file', {
          error: error instanceof Error ? error.message : String(error),
        }),
      ),
    );
  }
}

module.exports = {
  DASHBOARD_HTML_PATH,
  BOTS_PANEL_PATH,
  composeDashboard,
  findDashboardPath,
  serveDashboard,
};
