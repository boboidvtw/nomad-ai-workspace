/** @param {string} [home] */
export function createServiceRunner(home?: string): {
    /** @param {string} target */
    pathExists: (target: string) => boolean;
    /** @param {string} bin @returns {string | null} */
    which(bin: string): string | null;
    /** @param {number} port */
    probePort: (port: number) => Promise<boolean>;
    /** @param {string} pattern */
    findPids: (pattern: string) => Promise<number[]>;
    /** @param {number} port */
    pidsOnPort: (port: number) => Promise<number[]>;
    /** @param {number} pid */
    commandLine: (pid: number) => Promise<string>;
    /** @param {number} pid @param {NodeJS.Signals} signal */
    kill: (pid: number, signal: NodeJS.Signals) => true;
    /** @param {string} name */
    logHint: (name: string) => string;
    /** Terminal.app opens `.command` files without an automation permission prompt.
     * @param {string} name @param {string | undefined} command */
    writeLauncher(name: string, command: string | undefined): string;
    /**
     * @param {string} bin
     * @param {string[] | undefined} args
     * @param {{ cwd?: string, timeoutMs?: number, logName?: string }} options
     * @returns {Promise<{ code: number }>}
     */
    exec(bin: string, args: string[] | undefined, { cwd, timeoutMs, logName }: {
        cwd?: string;
        timeoutMs?: number;
        logName?: string;
    }): Promise<{
        code: number;
    }>;
    /**
     * Keeps running after the app quits, so closing Studio does not stop other services.
     * @param {string} bin
     * @param {string[] | undefined} args
     * @param {{ cwd?: string, logName: string }} options
     */
    spawnDetached(bin: string, args: string[] | undefined, { cwd, logName }: {
        cwd?: string;
        logName: string;
    }): number | undefined;
};
