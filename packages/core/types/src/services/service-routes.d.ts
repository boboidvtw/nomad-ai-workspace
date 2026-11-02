/**
 * Takes no request body on purpose: the id in the path is the only input.
 * @param {import('./service-controller').ServiceController} controller
 * @param {string | undefined} method
 * @param {string} pathname
 * @returns {Promise<{ status: number, body: unknown } | null>} null when the path is not ours
 */
export function handleServiceRequest(controller: import("./service-controller").ServiceController, method: string | undefined, pathname: string): Promise<{
    status: number;
    body: unknown;
} | null>;
