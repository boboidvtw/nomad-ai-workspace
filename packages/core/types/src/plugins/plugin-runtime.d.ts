export class PluginRuntime {
    /** @type {Map<string, { manifest: { id: string, name: string, version: string, description?: string }, hooks: Record<string, Function>, enabled: boolean }>} */
    plugins: Map<string, {
        manifest: {
            id: string;
            name: string;
            version: string;
            description?: string;
        };
        hooks: Record<string, Function>;
        enabled: boolean;
    }>;
    /**
     * Register a plugin with manifest validation
     * @param {Object} [plugin] - `manifest` is required; validated at runtime
     * @param {{ id: string, name: string, version: string, description?: string }} [plugin.manifest]
     * @param {Record<string, Function>} [plugin.hooks] - onPromptBeforeDispatch, onResponseSettled
     * @returns {import('../result').UnitResult<{ registeredId: string, version: string }>}
     */
    register(plugin?: {
        manifest?: {
            id: string;
            name: string;
            version: string;
            description?: string;
        } | undefined;
        hooks?: Record<string, Function> | undefined;
    }): import("../result").UnitResult<{
        registeredId: string;
        version: string;
    }>;
    /**
     * Execute lifecycle hook across all active plugins
     * @param {'onPromptBeforeDispatch'|'onResponseSettled'} hookName
     * @param {Record<string, unknown>} context
     * @returns {Promise<import('../result').UnitResult<Record<string, unknown>>>}
     */
    executeHook(hookName: "onPromptBeforeDispatch" | "onResponseSettled", context?: Record<string, unknown>): Promise<import("../result").UnitResult<Record<string, unknown>>>;
    listPlugins(): import("../result").UnitSuccess<{
        enabled: boolean;
        id: string;
        name: string;
        version: string;
        description?: string;
    }[]>;
}
