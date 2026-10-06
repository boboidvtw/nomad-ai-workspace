export type ServiceProbeResult = import("../constants").MonitoredService & {
    online: boolean;
    latencyMs: number;
    error: string | null;
    statusText: string;
};
export type ProbeSummary = {
    total: number;
    onlineCount: number;
    offlineCount: number;
    allEssentialOnline: boolean;
    overallStatus: "healthy" | "degraded";
};
/**
 * @typedef {import('../constants').MonitoredService & { online: boolean, latencyMs: number, error: string | null, statusText: string }} ServiceProbeResult
 */
/**
 * @typedef {Object} ProbeSummary
 * @property {number} total
 * @property {number} onlineCount
 * @property {number} offlineCount
 * @property {boolean} allEssentialOnline
 * @property {'healthy' | 'degraded'} overallStatus
 */
/**
 * Probes a single TCP host:port endpoint
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs=350]
 * @returns {Promise<{ online: boolean, latencyMs: number, error?: string }>}
 */
export function probePort(host: string | undefined, port: number, timeoutMs?: number): Promise<{
    online: boolean;
    latencyMs: number;
    error?: string;
}>;
/**
 * Probes all configured microservices concurrently
 * @param {ReadonlyArray<import('../constants').MonitoredService>} [services=MONITORED_SERVICES]
 * @param {number} [timeoutMs=350]
 * @returns {Promise<import('../result').UnitResult<{ services: ServiceProbeResult[], summary: ProbeSummary, timestamp: string }>>}
 */
export function probeAllServices(services?: ReadonlyArray<import("../constants").MonitoredService>, timeoutMs?: number): Promise<import("../result").UnitResult<{
    services: ServiceProbeResult[];
    summary: ProbeSummary;
    timestamp: string;
}>>;
