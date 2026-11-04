/**
 * Nomad Shared Core - Shipping HTTP routes (/api/shipping/*)
 * Shared by NomadDaemonServer and the Studio LocalSyncBridge. Every gate lives in ShippingLedger,
 * so these handlers only parse the request and map failures to HTTP statuses.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

/** @type {Record<string, number>} */
const STATUS_BY_CODE = {
  [ErrorCodes.SHIPPING_FEATURE_NOT_FOUND_003]: 404,
  [ErrorCodes.SHIPPING_ITEM_NOT_FOUND_004]: 404,
  [ErrorCodes.SHIPPING_GATE_BLOCKED_002]: 409,
  [ErrorCodes.SHIPPING_SEPARATION_VIOLATION_005]: 409,
  [ErrorCodes.SHIPPING_STATE_INVALID_007]: 409,
};

/**
 * @typedef {Object} ShippingServices
 * @property {import('./shipping-ledger').ShippingLedger | null} shipping
 *
 * @typedef {Object} ShippingRequest
 * @property {string} method
 * @property {string} pathname
 * @property {URLSearchParams} searchParams
 * @property {() => Promise<any>} readBody
 * @property {ShippingServices} services
 *
 * @typedef {{ status: number, payload: any }} ShippingResponse
 */

/** @param {any} result @returns {ShippingResponse} */
function respond(result) {
  if (result && result.success) return { status: 200, payload: result };
  return { status: STATUS_BY_CODE[result?.errorCode] || 400, payload: result };
}

/** @returns {ShippingResponse} */
function notAllowed() {
  return {
    status: 405,
    payload: err(ErrorCodes.SHIPPING_FEATURE_INVALID_001, 'Method not allowed on this path'),
  };
}

/** @returns {ShippingResponse} */
function notFound() {
  return {
    status: 404,
    payload: err(ErrorCodes.SHIPPING_ITEM_NOT_FOUND_004, 'Unknown shipping route'),
  };
}

/**
 * @param {import('./shipping-ledger').ShippingLedger} ledger
 * @param {string} method
 * @param {string[]} parts - segments after /api/shipping/friction
 * @param {() => Promise<any>} readBody
 */
async function frictionRoute(ledger, method, parts, readBody) {
  if (parts.length === 0) {
    if (method === 'GET') return respond(ok(ledger.board().friction));
    if (method === 'POST') return respond(ledger.addFriction((await readBody()) || {}));
    return notAllowed();
  }
  if (parts.length === 2 && parts[1] === 'resolve') {
    return method === 'POST' ? respond(ledger.resolveFriction(parts[0])) : notAllowed();
  }
  return notFound();
}

/**
 * @param {import('./shipping-ledger').ShippingLedger} ledger
 * @param {string} method
 * @param {string[]} parts - segments after /api/shipping/regressions
 * @param {() => Promise<any>} readBody
 */
async function regressionRoute(ledger, method, parts, readBody) {
  if (parts.length === 0)
    return method === 'GET' ? respond(ok(ledger.board().regressions)) : notAllowed();
  if (parts.length === 1) {
    return method === 'POST'
      ? respond(ledger.updateRegression(parts[0], (await readBody()) || {}))
      : notAllowed();
  }
  return notFound();
}

/**
 * @param {import('./shipping-ledger').ShippingLedger} ledger
 * @param {string} id
 * @param {string[]} rest - segments after the feature id
 * @param {any} body
 */
function featureAction(ledger, id, rest, body) {
  const [action, itemId, sub] = rest;
  if (action === 'squares' && itemId && sub === 'link') return ledger.linkTask(id, itemId, body);
  if (action === 'squares' && itemId && !sub) return ledger.updateSquare(id, itemId, body);
  if (rest.length !== 1) return null;
  /** @type {Record<string, () => any>} */
  const actions = {
    advance: () => ledger.advance(id, body),
    pause: () => ledger.pause(id, body),
    resume: () => ledger.resume(id, body),
    archive: () => ledger.archive(id, body),
    invariants: () => ledger.addInvariant(id, body),
    squares: () => ledger.addSquare(id, body),
    release: () => ledger.planRelease(id, body),
    smoke: () => ledger.recordSmoke(id, body),
    readback: () => ledger.recordReadback(id, body),
    regressions: () => ledger.addRegression(id, body),
  };
  return Object.hasOwn(actions, action) ? actions[action]() : null;
}

/**
 * @param {ShippingRequest} req
 * @returns {Promise<ShippingResponse | null>} null when the path is not a shipping route
 */
async function handleShippingRequest(req) {
  const { method, pathname, readBody, services } = req;
  if (pathname !== '/api/shipping' && !pathname.startsWith('/api/shipping/')) return null;
  const ledger = services.shipping;
  if (!ledger) {
    return {
      status: 503,
      payload: err(ErrorCodes.SHIPPING_STORAGE_FAILED_008, 'Shipping ledger is not available'),
    };
  }
  const parts = pathname.split('/').slice(3).filter(Boolean);
  if (parts.length === 0) {
    if (method === 'GET') return respond(ok(ledger.board()));
    if (method === 'POST') return respond(ledger.create((await readBody()) || {}));
    return notAllowed();
  }
  const [head, ...rest] = parts;
  if (head === 'friction') return frictionRoute(ledger, method, rest, readBody);
  if (head === 'regressions') return regressionRoute(ledger, method, rest, readBody);
  if (rest.length === 0) {
    if (method === 'GET') return respond(ledger.get(head));
    if (method === 'PATCH') return respond(ledger.updateContract(head, (await readBody()) || {}));
    return notAllowed();
  }
  if (method !== 'POST') return notAllowed();
  const result = featureAction(ledger, head, rest, (await readBody()) || {});
  return result ? respond(result) : notFound();
}

module.exports = { handleShippingRequest };
