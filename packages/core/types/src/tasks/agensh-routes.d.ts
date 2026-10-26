export type AgenshServices = {
    dispatcher: import("./dispatcher").TaskDispatcher;
    worktreeManager: import("./worktree-manager").WorktreeManager;
    p2pBus: import("./p2p-bus").P2PBus;
    sharedContext: import("./shared-context-pool").SharedContextPool;
};
export type AgenshRequest = {
    method: string;
    pathname: string;
    searchParams: URLSearchParams;
    readBody: () => Promise<any>;
    services: AgenshServices;
};
export type AgenshResponse = {
    status: number;
    payload: any;
};
/**
 * @param {AgenshRequest} req
 * @returns {Promise<AgenshResponse | null>} null when the path is not an Agensh route
 */
export function handleAgenshRequest(req: AgenshRequest): Promise<AgenshResponse | null>;
