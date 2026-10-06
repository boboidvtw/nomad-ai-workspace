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
 * @returns {Promise<import('../result').UnitResult<{ services: Array<Object>, summary: Object, timestamp: string }>>}
 */
export function probeAllServices(services?: ReadonlyArray<import("../constants").MonitoredService>, timeoutMs?: number): Promise<import("../result").UnitResult<{
    services: Array<any>;
    summary: any;
    timestamp: string;
}>>;
