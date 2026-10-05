const { test } = require('node:test');
const assert = require('node:assert');
const { PluginRuntime, isOk } = require('../../index');

test('PluginRuntime: registers plugin and executes lifecycle hooks', async () => {
  const runtime = new PluginRuntime();

  const mockPlugin = {
    manifest: {
      id: 'custom-prompter',
      name: 'Custom Prompt Enhancer',
      version: '1.0.0',
      description: 'Enhances prompt with prefix'
    },
    hooks: {
      onPromptBeforeDispatch: async (ctx) => {
        return { prompt: `[Enhanced] ${ctx.prompt}` };
      }
    }
  };

  const regRes = runtime.register(mockPlugin);
  assert.strictEqual(isOk(regRes), true);
  assert.strictEqual(regRes.data.registeredId, 'custom-prompter');

  const hookRes = await runtime.executeHook('onPromptBeforeDispatch', { prompt: 'Hello AI' });
  assert.strictEqual(isOk(hookRes), true);
  assert.strictEqual(hookRes.data.prompt, '[Enhanced] Hello AI');
});
