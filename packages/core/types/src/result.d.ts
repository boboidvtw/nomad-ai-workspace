export type UnitSuccess<T> = {
    success: true;
    data: T;
};
export type UnitFailure<E = string> = {
    success: false;
    errorCode: E;
    message: string;
    details?: unknown;
};
export type UnitResult<T, E = string> = UnitSuccess<T> | UnitFailure<E>;
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
export function ok<T>(data: T): UnitSuccess<T>;
/**
 * @template {string} E
 * @param {E} errorCode - Formatted as [MODULE]_[ACTION]_[REASON]_[3-DIGIT-INDEX]
 * @param {string} message - Human readable error message
 * @param {unknown} [details=null] - Optional structured metadata
 * @returns {UnitFailure<E>}
 */
export function err<E extends string>(errorCode: E, message: string, details?: unknown): UnitFailure<E>;
/**
 * Type guard for success
 * @template T, E
 * @param {UnitResult<T, E>} result
 * @returns {result is UnitSuccess<T>}
 */
export function isOk<T, E>(result: UnitResult<T, E>): result is UnitSuccess<T>;
/**
 * Type guard for error
 * @template T, E
 * @param {UnitResult<T, E>} result
 * @returns {result is UnitFailure<E>}
 */
export function isErr<T, E>(result: UnitResult<T, E>): result is UnitFailure<E>;
/**
 * Wraps an async function or promise to guarantee Result pattern return
 * @template T
 * @param {Promise<T> | (() => T | Promise<T>)} fnOrPromise
 * @param {string} [fallbackErrorCode]
 * @returns {Promise<UnitResult<T>>}
 */
export function wrapAsync<T>(fnOrPromise: Promise<T> | (() => T | Promise<T>), fallbackErrorCode?: string): Promise<UnitResult<T>>;
