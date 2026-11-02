/**
 * @nomad/core - OS access for the service controller
 * Uses execFile and spawn with argv only: nothing here goes through a shell.
 */

const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { probePort } = require('../probe/prober');

const PROBE_TIMEOUT_MS = 350;
const LOOKUP_TIMEOUT_MS = 5000;
const LOG_LIMIT_BYTES = 1024 * 1024;
const SAFE_NAME = /^[a-z0-9-]+$/;

/** Packaged apps start with a minimal PATH, so add where user tools live. @param {string} home */
function servicePath(home) {
  return [
    path.join(home, '.local/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    process.env.PATH || '/usr/bin:/bin',
    '/usr/sbin',
    '/sbin',
  ].join(':');
}

/** @param {string} [home] */
function createServiceRunner(home = os.homedir()) {
  const stateDir = path.join(home, '.nomad');
  const logDir = path.join(stateDir, 'service-logs');
  const launcherDir = path.join(stateDir, 'launchers');
  const env = { ...process.env, PATH: servicePath(home) };

  /** @param {string} name */
  function logPath(name) {
    if (!SAFE_NAME.test(name)) throw new Error('Invalid service name');
    return path.join(logDir, name + '.log');
  }

  /** Opens a fresh private log, replacing one that has grown too large. @param {string} name */
  function openLog(name) {
    fs.mkdirSync(logDir, { recursive: true, mode: 0o700 });
    const file = logPath(name);
    const oversized = fs.existsSync(file) && fs.statSync(file).size > LOG_LIMIT_BYTES;
    return fs.openSync(file, oversized ? 'w' : 'a', 0o600);
  }

  /** @param {string} bin @param {string[]} args @returns {Promise<string>} */
  function lookup(bin, args) {
    return new Promise((resolve) => {
      execFile(bin, args, { env, timeout: LOOKUP_TIMEOUT_MS }, (_error, stdout) => {
        resolve(String(stdout || ''));
      });
    });
  }

  /** @param {string} output @param {boolean} [includeSelf] @returns {number[]} */
  function parsePids(output, includeSelf = false) {
    return output
      .split('\n')
      .map((line) => Number.parseInt(line, 10))
      .filter((pid) => pid > 0 && (includeSelf || pid !== process.pid));
  }

  return {
    /** @param {string} target */
    pathExists: (target) => fs.existsSync(target),

    /** @param {string} bin @returns {string | null} */
    which(bin) {
      const candidates = path.isAbsolute(bin)
        ? [bin]
        : env.PATH.split(':').map((dir) => path.join(dir, bin));
      return candidates.find((file) => fs.existsSync(file)) || null;
    },

    /** @param {number} port */
    probePort: async (port) => (await probePort('127.0.0.1', port, PROBE_TIMEOUT_MS)).online,

    /**
     * Leaves this process out unless asked, so a stop can never kill the Studio itself. Asking
     * for it also lifts macOS pgrep's default of leaving out the caller's ancestors (-a), which
     * is safe only for status checks: an ancestor shell can carry the pattern in its command.
     * Linux pgrep never leaves them out, and its -a means something else.
     * @param {string} pattern @param {{ includeSelf?: boolean }} [options]
     */
    findPids: async (pattern, options = {}) => {
      const withAncestors = options.includeSelf && process.platform === 'darwin';
      const args = withAncestors ? ['-a', '-f', pattern] : ['-f', pattern];
      return parsePids(await lookup('/usr/bin/pgrep', args), options.includeSelf);
    },

    /** @param {number} port */
    pidsOnPort: async (port) =>
      parsePids(await lookup('/usr/sbin/lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'])),

    /** @param {number} pid */
    commandLine: (pid) => lookup('/bin/ps', ['-o', 'command=', '-p', String(pid)]),

    /** A process that already exited counts as killed. @param {number} pid @param {NodeJS.Signals} signal */
    kill(pid, signal) {
      try {
        process.kill(pid, signal);
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ESRCH') throw error;
      }
    },

    /** @param {string} name */
    logHint: (name) => `~/.nomad/service-logs/${name}.log`,

    /** Terminal.app opens `.command` files without an automation permission prompt.
     * @param {string} name @param {string | undefined} command */
    writeLauncher(name, command) {
      if (!SAFE_NAME.test(name)) throw new Error('Invalid service name');
      fs.mkdirSync(launcherDir, { recursive: true, mode: 0o700 });
      const file = path.join(launcherDir, name + '.command');
      fs.writeFileSync(file, `#!/bin/zsh -l\nexec ${command}\n`, { mode: 0o700 });
      return file;
    },

    /**
     * @param {string} bin
     * @param {string[] | undefined} args
     * @param {{ cwd?: string, timeoutMs?: number, logName?: string }} options
     * @returns {Promise<{ code: number }>}
     */
    exec(bin, args, { cwd, timeoutMs, logName }) {
      return new Promise((resolve) => {
        const log = logName ? openLog(logName) : 'ignore';
        const child = spawn(bin, args || [], { cwd, env, stdio: ['ignore', log, log] });
        const timer = timeoutMs ? setTimeout(() => child.kill('SIGTERM'), timeoutMs) : null;
        const finish = (/** @type {number} */ code) => {
          if (timer) clearTimeout(timer);
          if (typeof log === 'number') fs.closeSync(log);
          resolve({ code });
        };
        child.once('error', () => finish(1));
        child.once('close', (code) => finish(code ?? 1));
      });
    },

    /**
     * Keeps running after the app quits, so closing Studio does not stop other services.
     * @param {string} bin
     * @param {string[] | undefined} args
     * @param {{ cwd?: string, logName: string }} options
     */
    spawnDetached(bin, args, { cwd, logName }) {
      const log = openLog(logName);
      const child = spawn(bin, args || [], {
        cwd,
        env,
        detached: true,
        stdio: ['ignore', log, log],
      });
      child.once('error', () => {});
      child.unref();
      fs.closeSync(log);
      return child.pid;
    },
  };
}

module.exports = { createServiceRunner };
