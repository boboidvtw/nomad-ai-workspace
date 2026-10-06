export class PluginRuntime {
    plugins: Map<any, any>;
    /**
     * Register a plugin with manifest validation
     * @param {Object} [plugin] - `manifest` is required; validated at runtime
     * @param {{ id: string, name: string, version: string, description?: string }} [plugin.manifest]
     * @param {Object} [plugin.hooks] - onPromptBeforeDispatch, onResponseSettled
     * @returns {import('../result').UnitResult<{ registeredId: string, version: string }>}
     */
    register(plugin?: {
        manifest?: {
            id: string;
            name: string;
            version: string;
            description?: string;
        } | undefined;
        hooks?: any;
    }): import("../result").UnitResult<{
        registeredId: string;
        version: string;
    }>;
    /**
     * Execute lifecycle hook across all active plugins
     * @param {'onPromptBeforeDispatch'|'onResponseSettled'} hookName
     * @param {Object} context
     * @returns {Promise<import('../result').UnitResult<Object>>}
     */
    executeHook(hookName: "onPromptBeforeDispatch" | "onResponseSettled", context?: any): Promise<import("../result").UnitResult<any>>;
    listPlugins(): import("../result").UnitSuccess<any[]>;
}
