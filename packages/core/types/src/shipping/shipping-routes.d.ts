export type ShippingServices = {
    shipping: import("./shipping-ledger").ShippingLedger | null;
};
export type ShippingRequest = {
    method: string;
    pathname: string;
    searchParams: URLSearchParams;
    readBody: () => Promise<any>;
    services: ShippingServices;
};
export type ShippingResponse = {
    status: number;
    payload: any;
};
/**
 * @param {ShippingRequest} req
 * @returns {Promise<ShippingResponse | null>} null when the path is not a shipping route
 */
export function handleShippingRequest(req: ShippingRequest): Promise<ShippingResponse | null>;
