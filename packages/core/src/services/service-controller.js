/**
 * @nomad/core - Dashboard service controller
 * Starts and stops the services in the registry and reports their real state.
 * Actions run in the background; callers poll `list()`.
 */

const os = require('node:os');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');
const { buildServiceRegistry } = require('./service-registry');
const { createServiceRunner } = require('./service-runner');

const DEFAULT_TIMEOUT_MS = 30000;
const EXEC_GRACE_MS = 30000;
const DEFAULT_POLL_MS = 500;
const DOCKER_ENGINE_TIMEOUT_MS = 60000;
const OPEN_BIN = '/usr/bin/open';

/**
 * @typedef {'running' | 'stopped' | 'starting' | 'stopping' | 'failed' | 'ready' | 'unavailable'} ServiceState
 * @typedef {import('./service-registry').ServiceDefinition} ServiceDefinition
 */

class ServiceController {
  /**
   * @param {Object} [options]
   * @param {ServiceDefinition[]} [options.services]
   * @param {ReturnType<typeof createServiceRunner>} [options.runner]
   * @param {number} [options.pollMs]
   */
  constructor({ services, runner, pollMs = DEFAULT_POLL_MS } = {}) {
    this.services = services || buildServiceRegistry(os.homedir());
    this.runner = runner || createServiceRunner();
    this.pollMs = pollMs;
    /** @type {Map<string, { state: 'starting' | 'stopping', job: Promise<void> }>} */
    this.transitions = new Map();
    /** @type {Map<string, string>} */
    this.failures = new Map();
  }

  /** @param {string} id */
  find(id) {
    return this.services.find((service) => service.id === id);
  }

  /** @param {ServiceDefinition} service @returns {string | null} */
  unavailableReason(service) {
    const missingPath = (service.requires?.paths || []).find((p) => !this.runner.pathExists(p));
    if (missingPath) return service.requires?.reason || `找不到 ${missingPath}`;
    const bins = [service.start.bin, service.stop?.bin, service.needsDocker ? 'orb' : undefined];
    const missingBin = bins.find((bin) => bin && !this.runner.which(bin));
    return missingBin ? `找不到指令 ${missingBin}` : null;
  }

  /** @param {ServiceDefinition} service @returns {Promise<boolean>} */
  async isRunning(service) {
    if (!service.check) return false;
    if (service.check.type === 'port') return this.runner.probePort(service.check.port);
    return (await this.runner.findPids(service.check.pattern)).length > 0;
  }

  /** @param {ServiceDefinition} service */
  async describe(service) {
    const base = {
      id: service.id,
      label: service.label,
      confirmStart: service.confirmStart,
      confirmStop: service.confirmStop,
    };
    const reason = this.unavailableReason(service);
    if (reason) {
      return { ...base, state: 'unavailable', canStart: false, canStop: false, message: reason };
    }
    const transition = this.transitions.get(service.id);
    if (transition) return { ...base, state: transition.state, canStart: false, canStop: false };

    const stopNote = service.stop ? undefined : service.noStopReason;
    if (!service.check) {
      return { ...base, state: 'ready', canStart: true, canStop: false, message: stopNote };
    }
    const running = await this.isRunning(service);
    const failure = this.failures.get(service.id);
    if (failure) {
      return { ...base, state: 'failed', canStart: !running, canStop: running, message: failure };
    }
    const state = running ? 'running' : 'stopped';
    return { ...base, state, canStart: !running, canStop: running && Boolean(service.stop) };
  }

  async list() {
    const services = await Promise.all(this.services.map((s) => this.describe(s)));
    return ok({ services });
  }

  /** @param {string} id */
  start(id) {
    return this.request(id, 'starting');
  }

  /** @param {string} id */
  stop(id) {
    return this.request(id, 'stopping');
  }

  /**
   * @param {string} id
   * @param {'starting' | 'stopping'} state
   */
  async request(id, state) {
    const service = this.find(id);
    if (!service) return err(ErrorCodes.SERVICE_NOT_FOUND_001, `Unknown service: ${id}`);
    const stopping = state === 'stopping';
    if (stopping && !service.stop) {
      return err(ErrorCodes.SERVICE_ACTION_UNSUPPORTED_004, service.noStopReason || '不支援關閉');
    }
    const reason = this.unavailableReason(service);
    if (reason) return err(ErrorCodes.SERVICE_UNAVAILABLE_002, reason);
    if (this.transitions.has(id)) return err(ErrorCodes.SERVICE_BUSY_003, '這個服務正在處理中');

    // Claim the id before the first await, so two quick clicks cannot both start it.
    /** @type {() => void} */
    let release = () => {};
    const job = new Promise((resolve) => {
      release = () => resolve(undefined);
    });
    this.transitions.set(id, { state, job });
    const finish = () => {
      this.transitions.delete(id);
      release();
    };

    const running = await this.isRunning(service);
    if (service.check && running !== stopping) {
      finish();
      return ok({ id, state: running ? 'running' : 'stopped' });
    }
    this.failures.delete(id);
    const work = stopping ? this.runStop(service) : this.runStart(service);
    work
      .catch((/** @type {Error} */ error) => this.failures.set(id, error.message))
      .finally(finish);
    return ok({ id, state });
  }

  /** Resolves once the current action for `id` has finished. @param {string} id */
  async whenIdle(id) {
    await this.transitions.get(id)?.job;
  }

  /** @param {string | undefined} bin @returns {string} */
  resolveBin(bin) {
    const name = bin || '';
    return this.runner.which(name) || name;
  }

  /** @param {ServiceDefinition} service @param {import('./service-registry').ServiceAction} action */
  async runExec(service, action) {
    const timeoutMs = (service.timeoutMs || DEFAULT_TIMEOUT_MS) + EXEC_GRACE_MS;
    const result = await this.runner.exec(this.resolveBin(action.bin), action.args, {
      cwd: action.cwd,
      timeoutMs,
      logName: service.id,
    });
    if (result.code !== 0) throw new Error(`執行失敗，請看 ${this.runner.logHint(service.id)}`);
  }

  /** @param {ServiceDefinition} service */
  async runStart(service) {
    const { start } = service;
    if (start.kind === 'terminal') {
      const launcher = this.runner.writeLauncher(service.id, start.command);
      await this.runner.exec(OPEN_BIN, ['-a', 'Terminal', launcher], {});
      return;
    }
    if (service.needsDocker) {
      await this.runExec(
        { ...service, timeoutMs: DOCKER_ENGINE_TIMEOUT_MS },
        { kind: 'exec', bin: 'orb', args: ['start'] },
      );
    }
    if (start.kind === 'daemon') {
      this.runner.spawnDetached(this.resolveBin(start.bin), start.args, {
        cwd: start.cwd,
        logName: service.id,
      });
    } else {
      await this.runExec(service, start);
    }
    await this.waitFor(service, true);
  }

  /** @param {ServiceDefinition} service */
  async runStop(service) {
    if (service.stop?.kind === 'process') await this.killVerified(service);
    else if (service.stop) await this.runExec(service, service.stop);
    await this.waitFor(service, false);
  }

  /** Only signals processes whose command line carries the service's marker. @param {ServiceDefinition} service */
  async killVerified(service) {
    const { port, pattern, marker } = service.stop || {};
    const pids = port
      ? await this.runner.pidsOnPort(port)
      : await this.runner.findPids(pattern || '');
    const owned = [];
    for (const pid of pids) {
      if ((await this.runner.commandLine(pid)).includes(marker || '\0')) owned.push(pid);
    }
    if (owned.length === 0) throw new Error(`使用中的程式不是 ${service.label}，未關閉`);
    owned.forEach((pid) => this.runner.kill(pid, 'SIGTERM'));
  }

  /** @param {ServiceDefinition} service @param {boolean} wanted */
  async waitFor(service, wanted) {
    const deadline = Date.now() + (service.timeoutMs || DEFAULT_TIMEOUT_MS);
    for (;;) {
      if ((await this.isRunning(service)) === wanted) return;
      if (Date.now() >= deadline) {
        throw new Error(`操作逾時，請看 ${this.runner.logHint(service.id)}`);
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
  }
}

module.exports = { ServiceController };
