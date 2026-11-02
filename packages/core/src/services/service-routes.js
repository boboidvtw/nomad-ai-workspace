/**
 * @nomad/core - Dashboard service control routes
 * Shared by the daemon and the Studio bridge. Both run this behind their token check.
 */

const { ErrorCodes } = require('../error-codes');

const ACTION_PATH = /^\/api\/services\/([a-z0-9-]+)\/(start|stop)$/;

/** @param {{ success: boolean, errorCode?: string }} result */
function statusFor(result) {
  if (result.success) return 202;
  if (result.errorCode === ErrorCodes.SERVICE_NOT_FOUND_001) return 404;
  if (result.errorCode === ErrorCodes.SERVICE_BUSY_003) return 409;
  return 400;
}

/**
 * Takes no request body on purpose: the id in the path is the only input.
 * @param {import('./service-controller').ServiceController} controller
 * @param {string | undefined} method
 * @param {string} pathname
 * @returns {Promise<{ status: number, body: unknown } | null>} null when the path is not ours
 */
async function handleServiceRequest(controller, method, pathname) {
  if (pathname === '/api/services' && method === 'GET') {
    return { status: 200, body: await controller.list() };
  }
  const match = method === 'POST' ? pathname.match(ACTION_PATH) : null;
  if (!match) return null;
  const result =
    match[2] === 'start' ? await controller.start(match[1]) : await controller.stop(match[1]);
  return { status: statusFor(result), body: result };
}

module.exports = { handleServiceRequest };
