/**
 * @nomad/core - Same-origin route to the local Laya engine
 * The Dashboard calls this instead of Laya, so Laya needs no CORS setting of its own.
 * The target is fixed: nothing in a request chooses where it goes.
 */

const { err } = require('../result');
const { ErrorCodes } = require('../error-codes');

const LAYA_BASE = 'http://127.0.0.1:8555';
const LAYA_SYSTEMONE_URL = LAYA_BASE + '/v1/systemone';

/** Each Dashboard path maps to one method and one Laya URL. */
const ROUTES = {
  '/api/laya/systemone': { method: 'POST', url: LAYA_SYSTEMONE_URL },
  '/api/laya/health': { method: 'GET', url: LAYA_BASE + '/health' },
};
const LAYA_TIMEOUT_MS = 60000;

/** @param {string} text */
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

/**
 * @param {Object} request
 * @param {string | undefined} request.method
 * @param {string} request.pathname
 * @param {() => Promise<unknown>} request.readBody
 * @param {typeof fetch} [request.fetchImpl]
 * @returns {Promise<{ status: number, body: unknown } | null>} null when the path is not ours
 */
async function handleLayaRequest({ method, pathname, readBody, fetchImpl = fetch }) {
  const route = Object.hasOwn(ROUTES, pathname)
    ? ROUTES[/** @type {keyof ROUTES} */ (pathname)]
    : null;
  if (!route || method !== route.method) return null;
  /** @type {RequestInit} */
  const init = { method: route.method, signal: AbortSignal.timeout(LAYA_TIMEOUT_MS) };
  if (route.method === 'POST') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(await readBody());
  }
  try {
    const response = await fetchImpl(route.url, init);
    return { status: response.status, body: parseJson(await response.text()) };
  } catch {
    return {
      status: 502,
      body: err(ErrorCodes.SERVICE_LAYA_UNREACHABLE_005, '連不到 Laya（127.0.0.1:8555），請先啟動'),
    };
  }
}

module.exports = { handleLayaRequest, LAYA_SYSTEMONE_URL };
