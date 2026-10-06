export class LocalModelClient {
    /**
     * @param {Object} [options]
     * @param {string} [options.endpoint='http://127.0.0.1:1234/v1'] - Full OpenAI-compatible base URL; wins over host/port
     * @param {string} [options.host='127.0.0.1'] - Used to build the endpoint when `endpoint` is not given
     * @param {number} [options.port=1234] - Used to build the endpoint when `endpoint` is not given
     * @param {string} [options.defaultModel='local-model']
     * @param {number} [options.timeoutMs=15000]
     */
    constructor(options?: {
        endpoint?: string | undefined;
        host?: string | undefined;
        port?: number | undefined;
        defaultModel?: string | undefined;
        timeoutMs?: number | undefined;
    });
    endpoint: string;
    defaultModel: string;
    timeoutMs: number;
    /**
     * Probe if local inference server is online and list models
     * @param {string} [customEndpoint]
     * @returns {Promise<import('../result').UnitResult<{ online: boolean, endpoint: string, models: string[] }>>}
     */
    probe(customEndpoint?: string): Promise<import("../result").UnitResult<{
        online: boolean;
        endpoint: string;
        models: string[];
    }>>;
    /**
     * Dispatch chat completion request
     * @param {Object} [options]
     * @param {Array<{role: string, content: string}>} [options.messages] - Defaults to a single user turn built from `prompt`
     * @param {string} [options.prompt] - Shorthand for a single user message
     * @param {string} [options.endpoint] - Overrides the client endpoint for this call
     * @param {string} [options.model]
     * @param {number} [options.temperature=0.7]
     * @returns {Promise<import('../result').UnitResult<{ content: string, model: string, usage?: Object, latencyMs: number }>>}
     */
    chatCompletion(options?: {
        messages?: {
            role: string;
            content: string;
        }[] | undefined;
        prompt?: string | undefined;
        endpoint?: string | undefined;
        model?: string | undefined;
        temperature?: number | undefined;
    }): Promise<import("../result").UnitResult<{
        content: string;
        model: string;
        usage?: any;
        latencyMs: number;
    }>>;
}
