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
  SEMANTIC_TYPES
};
