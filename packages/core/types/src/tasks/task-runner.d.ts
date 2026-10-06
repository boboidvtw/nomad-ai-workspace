export class TaskRunner {
    /**
     * @param {import('./dispatcher').TaskDispatcher} dispatcher
     * @param {Object} [options]
     * @param {Object} [options.localModelClient]
     * @param {Function} [options.orchestratorDelegate]
     */
    constructor(dispatcher: import("./dispatcher").TaskDispatcher, options?: {
        localModelClient?: any;
        orchestratorDelegate?: Function | undefined;
    });
    dispatcher: import("./dispatcher").TaskDispatcher;
    localModelClient: any;
    orchestratorDelegate: Function | null;
    /**
     * Dispatches and executes a task end-to-end
     * @param {string} taskId
     * @param {string} agentId
     * @param {Object} [options]
     * @param {Function} [options.runnerFn] - Custom async (task, agent) => { summary, artifact }
     * @param {string} [options.customPrompt]
     * @returns {Promise<import('../result').UnitResult<Object, string>>}
     */
    dispatchAndRun(taskId: string, agentId: string, options?: {
        runnerFn?: Function | undefined;
        customPrompt?: string | undefined;
    }): Promise<import("../result").UnitResult<any, string>>;
    /**
     * Starts a background lease renewal loop
     * @param {string} taskId
     * @param {string} agentId
     * @param {number} [intervalMs=5000]
     * @returns {{ stop: () => void }}
     */
    startHeartbeatLoop(taskId: string, agentId: string, intervalMs?: number): {
        stop: () => void;
    };
}
