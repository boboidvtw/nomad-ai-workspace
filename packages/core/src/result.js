/**
 * Nomad Shared Core - Result Pattern
 * Governed by AGENTS.md Atomic Contract & Isolate Coding Protocol.
 * Zero-Exception Pattern: return structured UnitResult<T, E> instead of throwing.
 */

/**
 * @template T
 * @typedef {{ success: true, data: T }} UnitSuccess
 */

/**
 * @template [E=string]
 * @typedef {{ success: false, errorCode: E, message: string, details?: unknown }} UnitFailure
 */

/**
 * @template T
 * @template [E=string]
 * @typedef {UnitSuccess<T> | UnitFailure<E>} UnitResult
 */

/**
 * @template T
 * @param {T} data
 * @returns {UnitSuccess<T>}
 */
function ok(data) {
  return {
    success: true,
    // undefined is normalised to null so results always serialise with a `data` key
    data: /** @type {T} */ (data !== undefined ? data : null)
  };
}

/**
 * @template {string} E
 * @param {E} errorCode - Formatted as [MODULE]_[ACTION]_[REASON]_[3-DIGIT-INDEX]
 * @param {string} message - Human readable error message
 * @param {unknown} [details=null] - Optional structured metadata
 * @returns {UnitFailure<E>}
 */
function err(errorCode, message, details = null) {
  /** @type {UnitFailure<E>} */
  const result = {
    success: false,
    errorCode,
    message: String(message || 'Unknown error occurred')
  };
  if (details !== null && details !== undefined) {
    result.details = details;
  }
  return result;
}

/**
 * Type guard for success
 * @template T, E
 * @param {UnitResult<T, E>} result
 * @returns {result is UnitSuccess<T>}
 */
function isOk(result) {
  return Boolean(result && typeof result === 'object' && result.success === true);
}

/**
 * Type guard for error
 * @template T, E
 * @param {UnitResult<T, E>} result
 * @returns {result is UnitFailure<E>}
 */
function isErr(result) {
  return Boolean(result && typeof result === 'object' && result.success === false);
}

/**
 * Wraps an async function or promise to guarantee Result pattern return
 * @template T
 * @param {Promise<T> | (() => T | Promise<T>)} fnOrPromise
 * @param {string} [fallbackErrorCode]
 * @returns {Promise<UnitResult<T>>}
 */
async function wrapAsync(fnOrPromise, fallbackErrorCode = 'CORE_ASYNC_OPERATION_FAILED_001') {
  try {
    const data = typeof fnOrPromise === 'function' ? await fnOrPromise() : await fnOrPromise;
    if (data && typeof data === 'object' && 'success' in data) {
      return /** @type {UnitResult<T>} */ (/** @type {unknown} */ (data));
    }
    return ok(data);
  } catch (error) {
    return err(
      fallbackErrorCode,
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? { stack: error.stack } : null
    );
  }
}

module.exports = {
  ok,
  err,
  isOk,
  isErr,
  wrapAsync
};
