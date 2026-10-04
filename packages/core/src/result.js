/**
 * Nomad Shared Core - Result Pattern
 * Governed by AGENTS.md Atomic Contract & Isolate Coding Protocol.
 * Zero-Exception Pattern: return structured UnitResult<T, E> instead of throwing.
 */

/**
 * @template T
 * @param {T} data
 * @returns {{ success: true, data: T }}
 */
function ok(data) {
  return {
    success: true,
    data: data !== undefined ? data : null
  };
}

/**
 * @template E
 * @param {string} errorCode - Formatted as [MODULE]_[ACTION]_[REASON]_[3-DIGIT-INDEX]
 * @param {string} message - Human readable error message
 * @param {any} [details=null] - Optional structured metadata
 * @returns {{ success: false, errorCode: string, message: string, details?: any }}
 */
function err(errorCode, message, details = null) {
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
 * @param {any} result
 * @returns {boolean}
 */
function isOk(result) {
  return Boolean(result && typeof result === 'object' && result.success === true);
}

/**
 * Type guard for error
 * @param {any} result
 * @returns {boolean}
 */
function isErr(result) {
  return Boolean(result && typeof result === 'object' && result.success === false);
}

/**
 * Wraps an async function or promise to guarantee Result pattern return
 * @template T
 * @param {Promise<T>|Function} fnOrPromise
 * @param {string} fallbackErrorCode
 * @returns {Promise<{ success: true, data: T } | { success: false, errorCode: string, message: string }>}
 */
async function wrapAsync(fnOrPromise, fallbackErrorCode = 'CORE_ASYNC_OPERATION_FAILED_001') {
  try {
    const data = typeof fnOrPromise === 'function' ? await fnOrPromise() : await fnOrPromise;
    if (data && typeof data === 'object' && 'success' in data) {
      return data;
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
