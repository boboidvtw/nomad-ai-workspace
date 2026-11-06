/**
 * Nomad AI Studio - Desktop Agent IPC
 * `nomad:desktop-agent-run` runs one task (one at a time) and streams each step to the
 * renderer as `nomad:desktop-agent-step`; `nomad:desktop-agent-stop` aborts it.
 * Only tool names and outcomes reach the main log: snapshots hold private desktop content.
 */

const { createDesktopAgent, DEFAULT_MAX_STEPS } = require('./desktop-agent');
const {
  resolveAgentDesktopBin,
  createAgentDesktopExec,
  createToolChat,
} = require('./desktop-agent-io');

const APP_NAME_RE = /^[\p{L}\p{N} ._-]{1,64}$/u;

/**
 * @param {unknown} options
 * @returns {{ task: string, app: string, windowTitle: string, headed: boolean, model: string, host: string, port: number, maxSteps: number } | { error: string }}
 */
function validateRunOptions(options) {
  const o =
    options && typeof options === 'object' ? /** @type {Record<string, unknown>} */ (options) : {};
  const task = String(o.task ?? '').trim();
  const app = String(o.app ?? '').trim();
  const windowTitle = String(o.windowTitle ?? '').trim();
  const host = String(o.host || '127.0.0.1');
  const port = Number(o.port || 1234);
  if (!task) return { error: 'task is required' };
  if (task.length > 2000) return { error: 'task is too long (max 2000 chars)' };
  if (!APP_NAME_RE.test(app)) return { error: 'app must be an app name such as Finder' };
  if (windowTitle.length > 100) return { error: 'windowTitle is too long (max 100 chars)' };
  // The model server must be on this machine: snapshots carry private desktop content.
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) return { error: 'host must be local' };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: 'invalid port' };
  return {
    task,
    app,
    windowTitle,
    headed: o.headed === true,
    host,
    port,
    model: String(o.model ?? '').trim(),
    maxSteps: Number(o.maxSteps) || DEFAULT_MAX_STEPS,
  };
}

/**
 * @param {string} endpoint
 * @returns {Promise<string>}
 */
async function firstModel(endpoint) {
  const res = await fetch(`${endpoint}/models`, { signal: AbortSignal.timeout(3000) });
  const data = await res.json();
  const id = Array.isArray(data?.data) ? data.data[0]?.id : '';
  if (!id) throw new Error('no model loaded on the local server');
  return id;
}

/**
 * @param {{ ipcMain: Electron.IpcMain, getWindow: () => Electron.BrowserWindow | null }} deps
 */
function registerDesktopAgentIpc({ ipcMain, getWindow }) {
  /** @type {AbortController | null} */
  let running = null;

  /** @param {unknown} payload */
  const send = (payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('nomad:desktop-agent-step', payload);
  };

  ipcMain.handle('nomad:desktop-agent-run', async (_event, options) => {
    if (running) return { ok: false, error: 'a desktop task is already running' };
    const opts = validateRunOptions(options);
    if ('error' in opts) return { ok: false, error: opts.error };
    const bin = resolveAgentDesktopBin();
    if (!bin) {
      return { ok: false, error: 'agent-desktop not found. Install it: npm i -g agent-desktop' };
    }
    const endpoint = `http://${opts.host === '::1' ? '[::1]' : opts.host}:${opts.port}/v1`;
    const controller = new AbortController();
    running = controller;
    try {
      const model = opts.model || (await firstModel(endpoint));
      const agent = createDesktopAgent({
        exec: createAgentDesktopExec(bin),
        chat: createToolChat({ endpoint }),
      });
      console.log(`[Desktop Agent] start app=${opts.app} model=${model} maxSteps=${opts.maxSteps}`);
      const result = await agent.run({
        task: opts.task,
        app: opts.app,
        windowTitle: opts.windowTitle,
        headed: opts.headed,
        model,
        maxSteps: opts.maxSteps,
        signal: controller.signal,
        onStep: (step) => {
          if (step.kind === 'tool')
            console.log(`[Desktop Agent] #${step.step} ${step.tool} ok=${step.ok}`);
          send(step);
        },
      });
      console.log(
        `[Desktop Agent] end ok=${result.ok} reason=${result.reason} steps=${result.steps} ${result.elapsedMs}ms`,
      );
      return { ...result, model };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      running = null;
    }
  });

  ipcMain.handle('nomad:desktop-agent-stop', () => {
    if (!running) return { ok: true, stopped: false };
    running.abort();
    return { ok: true, stopped: true };
  });
}

module.exports = { registerDesktopAgentIpc, validateRunOptions };
