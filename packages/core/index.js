/**
 * @nomad/core entry point
 */

const { ok, err, isOk, isErr, wrapAsync } = require('./src/result');
const { ErrorCodes } = require('./src/error-codes');
const {
  DEFAULT_DAEMON_PORT,
  DEFAULT_DAEMON_HOST,
  MONITORED_SERVICES,
  PLATFORMS,
  LAYOUTS,
  SEMANTIC_TYPES
} = require('./src/constants');

const { extractVariables, interpolate } = require('./src/extensions/template-parser');
const { formatChatToMarkdown } = require('./src/extensions/markdown-exporter');

const { estimateTokens, compress } = require('./src/pipeline/headroom');
const { decide } = require('./src/pipeline/laya');
const { PipelineManager } = require('./src/pipeline/index');

const {
  DRIVE_FOLDER_NAME,
  WORKSPACES_FILE_NAME,
  SETTINGS_FILE_NAME,
  MANIFEST_FILE_NAME,
  detectLocalDriveFolder,
  computeChecksum,
  exportToDrive,
  importFromDrive,
  getSyncStatus
} = require('./src/sync/universal-drive-sync');

module.exports = {
  ok,
  err,
  isOk,
  isErr,
  wrapAsync,
  ErrorCodes,
  DEFAULT_DAEMON_PORT,
  DEFAULT_DAEMON_HOST,
  MONITORED_SERVICES,
  PLATFORMS,
  LAYOUTS,
  SEMANTIC_TYPES,
  extractVariables,
  interpolate,
  formatChatToMarkdown,
  // Pipeline (Headroom & Laya)
  estimateTokens,
  compress,
  decide,
  PipelineManager,
  // Universal Google Drive Sync
  DRIVE_FOLDER_NAME,
  WORKSPACES_FILE_NAME,
  SETTINGS_FILE_NAME,
  MANIFEST_FILE_NAME,
  detectLocalDriveFolder,
  computeChecksum,
  exportToDrive,
  importFromDrive,
  getSyncStatus
};
