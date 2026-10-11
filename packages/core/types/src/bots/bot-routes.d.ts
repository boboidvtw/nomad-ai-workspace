export type BotServices = {
    roster: import("./bot-roster").BotRoster;
    /**
     * - M5 mention/message router
     */
    router?: {
        send: (input: any) => Promise<any>;
    } | null | undefined;
    /**
     * - M6 group rooms
     */
    rooms?: {
        create: Function;
        list: Function;
        get: Function;
        post: Function;
        stop: Function;
    } | null | undefined;
};
export type BotRequest = {
    method: string;
    pathname: string;
    searchParams: URLSearchParams;
    readBody: () => Promise<any>;
    services: BotServices;
};
export type BotResponse = {
    status: number;
    payload: any;
};
/**
 * @param {BotRequest} req
 * @returns {Promise<BotResponse | null>} null when the path is not a bot route
 */
export function handleBotRequest(req: BotRequest): Promise<BotResponse | null>;
