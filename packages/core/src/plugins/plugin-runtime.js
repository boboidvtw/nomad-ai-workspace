/**
 * Nomad Plugin Runtime
 * Validates, registers and executes community extensions & hooks.
 * Governed by AGENTS.md Section 6: Atomic Contract & Result Pattern.
 */

const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

class PluginRuntime {
  constructor() {
    this.plugins = new Map(); // id -> { manifest, hooks }
  }

  /**
   * Register a plugin with manifest validation
   * @param {Object} [plugin] - `manifest` is required; validated at runtime
   * @param {{ id: string, name: string, version: string, description?: string }} [plugin.manifest]
   * @param {Object} [plugin.hooks] - onPromptBeforeDispatch, onResponseSettled
   * @returns {import('../result').UnitResult<{ registeredId: string, version: string }>}
   */
  register(plugin = {}) {
    const m = plugin.manifest;
    if (!m || !m.id || !m.name || !m.version) {
      return err(ErrorCodes.PLUGIN_MANIFEST_INVALID_001, 'Plugin manifest must specify id, name and version');
    }

    this.plugins.set(m.id, {
      manifest: m,
      hooks: plugin.hooks || {},
      enabled: true
    });

    return ok({ registeredId: m.id, version: m.version });
  }

  /**
   * Execute lifecycle hook across all active plugins
   * @param {'onPromptBeforeDispatch'|'onResponseSettled'} hookName
   * @param {Object} context
   * @returns {Promise<import('../result').UnitResult<Object>>}
   */
  async executeHook(hookName, context = {}) {
    try {
      let currentCtx = { ...context };

      for (const [id, plugin] of this.plugins.entries()) {
        if (!plugin.enabled) continue;
        const hookFn = plugin.hooks[hookName];
        if (typeof hookFn === 'function') {
          const res = await hookFn(currentCtx);
          if (res && typeof res === 'object') {
            currentCtx = { ...currentCtx, ...res };
          }
        }
      }

      return ok(currentCtx);
    } catch (e) {
      return err(ErrorCodes.PLUGIN_EXECUTION_FAILED_002, `Hook ${hookName} failed: ${e.message}`);
    }
  }

  listPlugins() {
    const list = Array.from(this.plugins.values()).map(p => ({
      ...p.manifest,
      enabled: p.enabled
    }));
    return ok(list);
  }
}

module.exports = {
  PluginRuntime
};
