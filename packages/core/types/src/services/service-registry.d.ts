export type ServiceAction = {
    kind: "exec" | "daemon" | "process" | "terminal";
    bin?: string | undefined;
    args?: string[] | undefined;
    cwd?: string | undefined;
    /**
     * - Terminal entries: the program to open
     */
    command?: string | undefined;
    /**
     * - Process stops: port the service listens on
     */
    port?: number | undefined;
    /**
     * - Process stops: pgrep pattern
     */
    pattern?: string | undefined;
    /**
     * - Process stops: must appear in the command line before any kill
     */
    marker?: string | undefined;
};
export type ServiceDefinition = {
    id: string;
    label: string;
    check?: {
        type: "port";
        port: number;
    } | {
        type: "process";
        pattern: string;
    } | undefined;
    start: ServiceAction;
    stop: ServiceAction | null;
    requires?: {
        paths?: string[];
        reason?: string;
    } | undefined;
    needsDocker?: boolean | undefined;
    timeoutMs?: number | undefined;
    confirmStart?: string | undefined;
    confirmStop?: string | undefined;
    noStopReason?: string | undefined;
};
/**
 * @param {string} home
 * @returns {ServiceDefinition[]}
 */
export function buildServiceRegistry(home: string): ServiceDefinition[];
