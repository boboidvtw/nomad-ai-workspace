/**
 * @nomad/daemon entry point
 */

const { NomadDaemonServer } = require('./src/server');
const { probePort, probeAllServices } = require('./src/prober');
const {
  readPid,
  writePid,
  removePid,
  isProcessRunning,
  getDaemonStatus,
  startDaemon,
  stopDaemon
} = require('./src/process-manager');
const { findDashboardPath, serveDashboard } = require('./src/static-handler');

module.exports = {
  NomadDaemonServer,
  probePort,
  probeAllServices,
  readPid,
  writePid,
  removePid,
  isProcessRunning,
  getDaemonStatus,
  startDaemon,
  stopDaemon,
  findDashboardPath,
  serveDashboard
};
