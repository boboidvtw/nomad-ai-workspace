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
  formatChatToMarkdown
};
