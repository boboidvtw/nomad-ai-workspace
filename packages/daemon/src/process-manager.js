/**
 * Nomad Core Daemon - Process Manager (PID & Daemonization)
 * Governed by AGENTS.md Atomic Contract & Result Pattern.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { ok, err, ErrorCodes, DEFAULT_DAEMON_PORT, probePort } = require('@nomad/core');

const NOMAD_DIR = path.join(os.homedir(), '.nomad');
const PID_FILE = path.join(NOMAD_DIR, 'daemon.pid');
const LOG_FILE = path.join(NOMAD_DIR, 'daemon.log');

function ensureNomadDir() {
  if (!fs.existsSync(NOMAD_DIR)) {
    fs.mkdirSync(NOMAD_DIR, { recursive: true });
  }
}

function readPid() {
  try {
    if (!fs.existsSync(PID_FILE)) return null;
    const content = fs.readFileSync(PID_FILE, 'utf-8').trim();
    const pid = parseInt(content, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * @param {number} pid
 */
function writePid(pid) {
  ensureNomadDir();
  fs.writeFileSync(PID_FILE, String(pid), 'utf-8');
}

function removePid() {
  try {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
  } catch {
    // Graceful ignore
  }
}

/**
 * @param {number | null | undefined} pid
 * @returns {boolean}
 */
function isProcessRunning(pid) {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Checks daemon running status
 * @param {number} [port=DEFAULT_DAEMON_PORT]
 * @returns {Promise<import('@nomad/core').UnitSuccess<{ running: boolean, pid: number|null, port: number, reachable: boolean, latencyMs: number, logFile: string, pidFile: string }>>}
 */
async function getDaemonStatus(port = DEFAULT_DAEMON_PORT) {
  const pid = readPid();
  const processAlive = pid ? isProcessRunning(pid) : false;
  const probe = await probePort('127.0.0.1', port, 300);

  if (pid && !processAlive) {
    removePid();
  }

  return ok({
    running: processAlive || probe.online,
    pid: processAlive ? pid : null,
    port,
    reachable: probe.online,
    latencyMs: probe.latencyMs,
    logFile: LOG_FILE,
    pidFile: PID_FILE,
  });
}

/**
 * Starts the daemon as a detached background process
 * @param {string} daemonScriptPath
 * @param {number} [port=DEFAULT_DAEMON_PORT]
 * @returns {Promise<import('@nomad/core').UnitResult<{ pid: number|null|undefined, alreadyRunning: boolean, port: number, message: string }>>}
 */
async function startDaemon(daemonScriptPath, port = DEFAULT_DAEMON_PORT) {
  const currentStatus = await getDaemonStatus(port);
  if (currentStatus.data.running) {
    return ok({
      pid: currentStatus.data.pid,
      alreadyRunning: true,
      port,
      message: 'Nomad Daemon is already running.',
    });
  }

  ensureNomadDir();
  const out = fs.openSync(LOG_FILE, 'a');
  const errOut = fs.openSync(LOG_FILE, 'a');

  const child = spawn(process.execPath, [daemonScriptPath, 'run'], {
    detached: true,
    stdio: ['ignore', out, errOut],
    env: { ...process.env, NOMAD_PORT: String(port) },
  });

  child.unref();
  if (child.pid === undefined) {
    return err(ErrorCodes.DAEMON_SERVER_START_FAILED_002, 'Failed to spawn the daemon process', {
      logFile: LOG_FILE,
    });
  }
  writePid(child.pid);

  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const probe = await probePort('127.0.0.1', port, 200);
    if (probe.online) {
      return ok({
        pid: child.pid,
        alreadyRunning: false,
        port,
        message: 'Nomad Daemon started successfully.',
      });
    }
  }

  return err(
    ErrorCodes.DAEMON_SERVER_START_FAILED_002,
    'Daemon spawned but port did not become active within 3s',
    { pid: child.pid, port, logFile: LOG_FILE },
  );
}

/**
 * Stops the running daemon process
 * @param {number} [timeoutMs=3000]
 * @returns {Promise<import('@nomad/core').UnitResult<{ stopped: boolean, message: string }>>}
 */
async function stopDaemon(timeoutMs = 3000) {
  const pid = readPid();
  if (!pid) {
    return ok({ stopped: true, message: 'No daemon PID found to stop.' });
  }

  if (!isProcessRunning(pid)) {
    removePid();
    return ok({ stopped: true, message: 'Daemon was not actively running (stale PID removed).' });
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (e) {
    return err(ErrorCodes.DAEMON_PROCESS_KILL_FAILED_004, 'Failed to send SIGTERM to PID ' + pid, {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  const startTime = Date.now();
  while (isProcessRunning(pid)) {
    if (Date.now() - startTime > timeoutMs) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {}
      break;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  removePid();
  return ok({ stopped: true, message: 'Nomad Daemon (PID ' + pid + ') stopped.' });
}

module.exports = {
  NOMAD_DIR,
  PID_FILE,
  LOG_FILE,
  readPid,
  writePid,
  removePid,
  isProcessRunning,
  getDaemonStatus,
  startDaemon,
  stopDaemon,
};
