#!/usr/bin/env node
/**
 * Nomad Core Daemon CLI
 * Commands: run | start | stop | restart | status | probe
 */

const path = require('path');
const {
  NomadDaemonServer,
  getDaemonStatus,
  startDaemon,
  stopDaemon,
  probeAllServices,
  writePid,
  removePid
} = require('../index');
const { DEFAULT_DAEMON_PORT } = require('@nomad/core');

const args = process.argv.slice(2);
const command = args[0] || 'status';

function getPortArg() {
  const idx = args.indexOf('--port');
  if (idx !== -1 && args[idx + 1]) {
    return parseInt(args[idx + 1], 10);
  }
  return parseInt(process.env.NOMAD_PORT || String(DEFAULT_DAEMON_PORT), 10);
}

const port = getPortArg();

async function main() {
  switch (command) {
    case 'run': {
      console.log('🚀 [Nomad Daemon] Starting in foreground on port ' + port + '...');
      writePid(process.pid);

      const server = new NomadDaemonServer({ port });
      try {
        await server.start();
      } catch (err) {
        console.error('❌ Failed to start daemon:', err.message || err);
        removePid();
        process.exit(1);
      }

      const cleanup = async () => {
        console.log('🛑 [Nomad Daemon] Shutting down...');
        removePid();
        await server.stop();
        process.exit(0);
      };

      process.on('SIGINT', cleanup);
      process.on('SIGTERM', cleanup);
      break;
    }

    case 'start': {
      console.log('📡 [Nomad Daemon] Spawning background daemon on port ' + port + '...');
      const scriptPath = path.resolve(__dirname, 'nomad-daemon.js');
      const res = await startDaemon(scriptPath, port);
      if (res.success) {
        console.log('✅ ' + res.data.message + ' (PID: ' + res.data.pid + ')');
        console.log('🔗 Gateway API: http://127.0.0.1:' + port + '/api/status');
        console.log('📊 Dashboard:   http://127.0.0.1:' + port + '/dashboard');
      } else {
        console.error('❌ ' + res.message);
        process.exit(1);
      }
      break;
    }

    case 'stop': {
      console.log('🛑 [Nomad Daemon] Stopping daemon...');
      const res = await stopDaemon(3000);
      if (res.success) {
        console.log('✅ ' + res.data.message);
      } else {
        console.error('❌ ' + res.message);
        process.exit(1);
      }
      break;
    }

    case 'restart': {
      console.log('🔄 [Nomad Daemon] Restarting daemon...');
      await stopDaemon(3000);
      await new Promise(r => setTimeout(r, 600));
      const scriptPath = path.resolve(__dirname, 'nomad-daemon.js');
      const res = await startDaemon(scriptPath, port);
      if (res.success) {
        console.log('✅ ' + res.data.message + ' (PID: ' + res.data.pid + ')');
      } else {
        console.error('❌ ' + res.message);
        process.exit(1);
      }
      break;
    }

    case 'status': {
      const statusRes = await getDaemonStatus(port);
      const data = statusRes.data;
      console.log('=== 🛸 Nomad Core Daemon Status ===');
      console.log('Running:     ' + (data.running ? '🟢 YES' : '⚪ NO'));
      console.log('PID:         ' + (data.pid || 'None'));
      console.log('Port:        ' + data.port);
      console.log('Reachable:   ' + (data.reachable ? '🟢 Online (' + data.latencyMs + 'ms)' : '⚪ Offline'));
      console.log('PID File:    ' + data.pidFile);
      console.log('Log File:    ' + data.logFile);
      break;
    }

    case 'probe': {
      console.log('=== 🔌 Probing All Microservices ===');
      const probeRes = await probeAllServices();
      if (!probeRes.success) {
        console.error('❌ ' + probeRes.message);
        process.exit(1);
      }
      const s = probeRes.data;
      for (const svc of s.services) {
        const icon = svc.online ? '🟢' : '⚪';
        const ms = svc.online ? '(' + svc.latencyMs + 'ms)' : '';
        console.log(icon + ' ' + svc.name.padEnd(28) + ' [Port ' + String(svc.port).padEnd(5) + '] ' + (svc.online ? 'Online' : 'Offline') + ' ' + ms);
      }
      console.log('------------------------------------');
      console.log('Summary: ' + s.summary.onlineCount + ' online, ' + s.summary.offlineCount + ' offline. Health: ' + s.summary.overallStatus);
      break;
    }

    default: {
      console.log('Usage: nomad-daemon <run|start|stop|restart|status|probe> [--port <port>]');
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
