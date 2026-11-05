export type ServiceState = "running" | "stopped" | "starting" | "stopping" | "failed" | "ready" | "unavailable";
export type ServiceDefinition = import("./service-registry").ServiceDefinition;
/**
 * @typedef {'running' | 'stopped' | 'starting' | 'stopping' | 'failed' | 'ready' | 'unavailable'} ServiceState
 * @typedef {import('./service-registry').ServiceDefinition} ServiceDefinition
 */
export class ServiceController {
    /**
     * @param {Object} [options]
     * @param {ServiceDefinition[]} [options.services]
     * @param {ReturnType<typeof createServiceRunner>} [options.runner]
     * @param {number} [options.pollMs]
     */
    constructor({ services, runner, pollMs }?: {
        services?: import("./service-registry").ServiceDefinition[] | undefined;
        runner?: {
            pathExists: (target: string) => boolean;
            which(bin: string): string | null;
            probePort: (port: number) => Promise<boolean>;
            findPids: (pattern: string, options?: {
                includeSelf?: boolean;
            }) => Promise<number[]>;
            pidsOnPort: (port: number) => Promise<number[]>;
            commandLine: (pid: number) => Promise<string>;
            kill(pid: number, signal: NodeJS.Signals): void;
            logHint: (name: string) => string;
            writeLauncher(name: string, command: string | undefined): string;
            exec(bin: string, args: string[] | undefined, { cwd, timeoutMs, logName }: {
                cwd?: string;
                timeoutMs? /** @type {() => void} */: number;
                logName?: string;
            }): Promise<{
                code: number;
            }>;
            spawnDetached(bin: string, args: string[] | undefined, { cwd, logName }: {
                cwd?: string;
                logName: string;
            }): number | undefined;
        } | undefined;
        pollMs?: number | undefined;
    });
    services: import("./service-registry").ServiceDefinition[];
    runner: {
        pathExists: (target: string) => boolean;
        which(bin: string): string | null;
        probePort: (port: number) => Promise<boolean>;
        findPids: (pattern: string, options?: {
            includeSelf?: boolean;
        }) => Promise<number[]>;
        pidsOnPort: (port: number) => Promise<number[]>;
        commandLine: (pid: number) => Promise<string>;
        kill(pid: number, signal: NodeJS.Signals): void;
        logHint: (name: string) => string;
        writeLauncher(name: string, command: string | undefined): string;
        exec(bin: string, args: string[] | undefined, { cwd, timeoutMs, logName }: {
            cwd?: string;
            timeoutMs? /** @type {() => void} */: number;
            logName?: string;
        }): Promise<{
            code: number;
        }>;
        spawnDetached(bin: string, args: string[] | undefined, { cwd, logName }: {
            cwd?: string;
            logName: string;
        }): number | undefined;
    };
    pollMs: number;
    /** @type {Map<string, { state: 'starting' | 'stopping', job: Promise<void> }>} */
    transitions: Map<string, {
        state: "starting" | "stopping";
        job: Promise<void>;
    }>;
    /** @type {Map<string, string>} */
    failures: Map<string, string>;
    /** @param {string} id */
    find(id: string): import("./service-registry").ServiceDefinition | undefined;
    /** @param {ServiceDefinition} service @returns {string | null} */
    unavailableReason(service: ServiceDefinition): string | null;
    /** @param {ServiceDefinition} service @returns {Promise<boolean>} */
    isRunning(service: ServiceDefinition): Promise<boolean>;
    /** @param {ServiceDefinition} service */
    describe(service: ServiceDefinition): Promise<{
        state: string;
        canStart: boolean;
        canStop: boolean;
        message: string | undefined;
        id: string;
        label: string;
        confirmStart: string | undefined;
        confirmStop: string | undefined;
    } | {
        state: string;
        canStart: boolean;
        canStop: boolean;
        ui: string;
        id: string;
        label: string;
        confirmStart: string | undefined;
        confirmStop: string | undefined;
    } | {
        state: string;
        canStart: boolean;
        canStop: boolean;
        ui?: undefined;
        id: string;
        label: string;
        confirmStart: string | undefined;
        confirmStop: string | undefined;
    }>;
    list(): Promise<import("../result").UnitSuccess<{
        services: ({
            state: string;
            canStart: boolean;
            canStop: boolean;
            message: string | undefined;
            id: string;
            label: string;
            confirmStart: string | undefined;
            confirmStop: string | undefined;
        } | {
            state: string;
            canStart: boolean;
            canStop: boolean;
            ui: string;
            id: string;
            label: string;
            confirmStart: string | undefined;
            confirmStop: string | undefined;
        } | {
            state: string;
            canStart: boolean;
            canStop: boolean;
            ui?: undefined;
            id: string;
            label: string;
            confirmStart: string | undefined;
            confirmStop: string | undefined;
        })[];
    }>>;
    /** @param {string} id */
    start(id: string): Promise<import("../result").UnitFailure<"SERVICE_NOT_FOUND_001"> | import("../result").UnitFailure<"SERVICE_ACTION_UNSUPPORTED_004"> | import("../result").UnitFailure<"SERVICE_UNAVAILABLE_002"> | import("../result").UnitFailure<"SERVICE_BUSY_003"> | import("../result").UnitSuccess<{
        id: string;
        state: string;
    }>>;
    /** @param {string} id */
    stop(id: string): Promise<import("../result").UnitFailure<"SERVICE_NOT_FOUND_001"> | import("../result").UnitFailure<"SERVICE_ACTION_UNSUPPORTED_004"> | import("../result").UnitFailure<"SERVICE_UNAVAILABLE_002"> | import("../result").UnitFailure<"SERVICE_BUSY_003"> | import("../result").UnitSuccess<{
        id: string;
        state: string;
    }>>;
    /**
     * @param {string} id
     * @param {'starting' | 'stopping'} state
     */
    request(id: string, state: "starting" | "stopping"): Promise<import("../result").UnitFailure<"SERVICE_NOT_FOUND_001"> | import("../result").UnitFailure<"SERVICE_ACTION_UNSUPPORTED_004"> | import("../result").UnitFailure<"SERVICE_UNAVAILABLE_002"> | import("../result").UnitFailure<"SERVICE_BUSY_003"> | import("../result").UnitSuccess<{
        id: string;
        state: string;
    }>>;
    /** Resolves once the current action for `id` has finished. @param {string} id */
    whenIdle(id: string): Promise<void>;
    /** @param {string | undefined} bin @returns {string} */
    resolveBin(bin: string | undefined): string;
    /** @param {ServiceDefinition} service @param {import('./service-registry').ServiceAction} action */
    runExec(service: ServiceDefinition, action: import("./service-registry").ServiceAction): Promise<void>;
    /** @param {ServiceDefinition} service */
    runStart(service: ServiceDefinition): Promise<void>;
    /** @param {ServiceDefinition} service */
    startDockerEngine(service: ServiceDefinition): Promise<void>;
    /** OrbStack can restart its VM mid-build (updates do this); `compose up` is safe to repeat.
     * @param {ServiceDefinition} service */
    runDockerStart(service: ServiceDefinition): Promise<void>;
    /** @param {ServiceDefinition} service */
    runStop(service: ServiceDefinition): Promise<void>;
    /** @param {ServiceDefinition} service @returns {Promise<number[]>} */
    ownedPids(service: ServiceDefinition): Promise<number[]>;
    /** Only signals processes whose command line carries the service's marker, checked again
     * before escalating to SIGKILL. @param {ServiceDefinition} service */
    killVerified(service: ServiceDefinition): Promise<void>;
    /** @param {ServiceDefinition} service @param {boolean} wanted @param {number} deadline */
    reaches(service: ServiceDefinition, wanted: boolean, deadline: number): Promise<boolean>;
    /** @param {ServiceDefinition} service @param {boolean} wanted */
    waitFor(service: ServiceDefinition, wanted: boolean): Promise<void>;
}
