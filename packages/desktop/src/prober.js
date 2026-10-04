/**
 * Nomad Core Daemon - Microservice Health Prober
 * Governed by AGENTS.md Atomic Contract & Result Pattern.
 */

const net = require('net');
let ok, err, ErrorCodes, MONITORED_SERVICES;
try {
  const core = require('@nomad/core');
  ok = core.ok;
  err = core.err;
  ErrorCodes = core.ErrorCodes;
  MONITORED_SERVICES = core.MONITORED_SERVICES;
} catch (e) {
  try {
    const core = require('@nomad/core');
    ok = core.ok;
    err = core.err;
    ErrorCodes = core.ErrorCodes;
    MONITORED_SERVICES = core.MONITORED_SERVICES;
  } catch (e2) {
    ok = (data) => ({ success: true, data });
    err = (code, msg, details) => ({ success: false, errorCode: code, message: msg, details });
    ErrorCodes = { PROBE_CHECK_FAILED_004: 'PROBE_CHECK_FAILED_004' };
    MONITORED_SERVICES = [
      { id: 'nomad_gateway', name: 'Nomad Daemon Gateway', port: 8765, host: '127.0.0.1', category: 'gateway', essential: true },
      { id: 'postgres', name: 'PostgreSQL 16 (OrbStack)', port: 5432, host: '127.0.0.1', category: 'database', essential: false },
      { id: 'redis', name: 'Redis 7 (OrbStack)', port: 6379, host: '127.0.0.1', category: 'cache', essential: false },
      { id: 'adminer', name: 'Postgres Adminer', port: 8080, host: '127.0.0.1', category: 'tool', essential: false },
      { id: 'lmstudio', name: 'LM Studio Inference', port: 1234, host: '127.0.0.1', category: 'ai-engine', essential: false },
      { id: 'hermes_ws', name: 'Hermes Workspace', port: 8787, host: '127.0.0.1', category: 'agent', essential: false }
    ];
  }
}

/**
 * Probes a single TCP host:port endpoint
 * @param {string} host
 * @param {number} port
 * @param {number} [timeoutMs=350]
 * @returns {Promise<{ online: boolean, latencyMs: number, error?: string }>}
 */
function probePort(host = '127.0.0.1', port, timeoutMs = 350) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let isResolved = false;

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      if (isResolved) return;
      isResolved = true;
      const latencyMs = Date.now() - startTime;
      cleanup();
      resolve({ online: true, latencyMs });
    });

    socket.once('timeout', () => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      resolve({ online: false, latencyMs: timeoutMs, error: 'ETIMEDOUT' });
    });

    socket.once('error', (err) => {
      if (isResolved) return;
      isResolved = true;
      const latencyMs = Date.now() - startTime;
      cleanup();
      resolve({ online: false, latencyMs, error: err.code || err.message });
    });

    socket.connect(port, host);
  });
}

/**
 * Probes all configured microservices concurrently
 * @param {Array<Object>} [services=MONITORED_SERVICES]
 * @param {number} [timeoutMs=350]
 * @returns {Promise<{ success: true, data: { services: Array<Object>, summary: Object, timestamp: string } }>}
 */
async function probeAllServices(services = MONITORED_SERVICES, timeoutMs = 350) {
  try {
    const probePromises = services.map(async (svc) => {
      const result = await probePort(svc.host || '127.0.0.1', svc.port, timeoutMs);
      return {
        id: svc.id,
        name: svc.name,
        port: svc.port,
        host: svc.host || '127.0.0.1',
        category: svc.category || 'general',
        essential: Boolean(svc.essential),
        online: result.online,
        latencyMs: result.latencyMs,
        error: result.error || null,
        statusText: result.online ? '🟢 Online' : '⚪ Offline'
      };
    });

    const evaluated = await Promise.all(probePromises);
    const onlineCount = evaluated.filter(s => s.online).length;
    const offlineCount = evaluated.length - onlineCount;
    const allEssentialOnline = evaluated.filter(s => s.essential).every(s => s.online);

    return ok({
      timestamp: new Date().toISOString(),
      services: evaluated,
      summary: {
        total: evaluated.length,
        onlineCount,
        offlineCount,
        allEssentialOnline,
        overallStatus: allEssentialOnline ? 'healthy' : 'degraded'
      }
    });
  } catch (error) {
    return err(
      ErrorCodes.PROBE_CHECK_FAILED_004,
      'Failed to execute microservice health probe',
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

module.exports = {
  probePort,
  probeAllServices
};
