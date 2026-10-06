/**
 * Nomad Core Daemon - Static Handler for Nomad Dashboard
 * Re-exported from @nomad/dashboard, the single source of the dashboard HTML.
 */

const { findDashboardPath, serveDashboard } = require('@nomad/dashboard');

module.exports = {
  findDashboardPath,
  serveDashboard
};
