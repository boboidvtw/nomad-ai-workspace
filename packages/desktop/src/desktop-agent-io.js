/**
 * Nomad AI Studio - Desktop Agent I/O
 * Runs the agent-desktop CLI and calls an OpenAI-compatible chat endpoint with `tools`.
 * Kept apart from desktop-agent.js so the loop can be tested without processes or HTTP.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXEC_TIMEOUT_MS = 60_000;
const CHAT_TIMEOUT_MS = 300_000;

/**
 * Apps launched from Finder get a minimal PATH, so the usual install locations are
 * checked too. `NOMAD_AGENT_DESKTOP_BIN` wins when set.
 * @param {{ env?: NodeJS.ProcessEnv, homedir?: string, exists?: (p: string) => boolean }} [options]
 * @returns {string | null}
 */
function resolveAgentDesktopBin({
  env = process.env,
  homedir = os.homedir(),
  exists = isExecutable,
} = {}) {
  if (env.NOMAD_AGENT_DESKTOP_BIN && exists(env.NOMAD_AGENT_DESKTOP_BIN)) {
    return env.NOMAD_AGENT_DESKTOP_BIN;
  }
  const dirs = [
    ...String(env.PATH || '')
      .split(path.delimiter)
      .filter(Boolean),
    path.join(homedir, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  for (const dir of dirs) {
    const candidate = path.join(dir, 'agent-desktop');
    if (exists(candidate)) return candidate;
  }
  return null;
}

/** @param {string} p */
function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} bin
 * @returns {import('./desktop-agent').DesktopExec}
 */
function createAgentDesktopExec(bin) {
  return (args, { stdin, signal } = {}) =>
    new Promise((resolve) => {
      const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], signal });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill('SIGTERM'), EXEC_TIMEOUT_MS);
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.on('error', (e) => {
        clearTimeout(timer);
        resolve({ ok: false, error: { code: 'SPAWN_FAILED', message: e.message } });
      });
      child.on('close', () => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve({
            ok: false,
            error: { code: 'NO_JSON', message: stderr.trim().slice(0, 500) || 'no JSON output' },
          });
        }
      });
      child.stdin.on('error', () => {});
      child.stdin.end(stdin ?? '');
    });
}

/**
 * @param {{ endpoint: string, fetchImpl?: typeof fetch, temperature?: number }} options
 *   endpoint: OpenAI-compatible base URL, e.g. http://127.0.0.1:1234/v1
 * @returns {import('./desktop-agent').ChatFn}
 */
function createToolChat({ endpoint, fetchImpl = fetch, temperature = 0 }) {
  return async ({ model, messages, tools, signal }) => {
    const timeout = AbortSignal.timeout(CHAT_TIMEOUT_MS);
    const res = await fetchImpl(`${endpoint.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, tools, temperature, stream: false }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`model server returned HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const message = data?.choices?.[0]?.message;
    if (!message) throw new Error('model server returned no message');
    return message;
  };
}

module.exports = { resolveAgentDesktopBin, createAgentDesktopExec, createToolChat };
