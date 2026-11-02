/**
 * @param {Object} request
 * @param {string | undefined} request.method
 * @param {string} request.pathname
 * @param {() => Promise<unknown>} request.readBody
 * @param {typeof fetch} [request.fetchImpl]
 * @returns {Promise<{ status: number, body: unknown } | null>} null when the path is not ours
 */
export function handleLayaRequest({ method, pathname, readBody, fetchImpl }: {
    method: string | undefined;
    pathname: string;
    readBody: () => Promise<unknown>;
    fetchImpl?: typeof fetch | undefined;
}): Promise<{
    status: number;
    body: unknown;
} | null>;
export const LAYA_SYSTEMONE_URL: string;
