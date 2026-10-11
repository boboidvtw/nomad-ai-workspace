/**
 * Nomad Shared Core - Bots (SPEC-AGENT-BOTS)
 */

const {
  BOT_STATE,
  DEFAULT_ROSTER_PATH,
  MAX_TIMELINE_ENTRIES,
  BotRoster,
  toBotHandle,
} = require('./bot-roster');
const { handleBotRequest } = require('./bot-routes');

module.exports = {
  BOT_STATE,
  DEFAULT_ROSTER_PATH,
  MAX_TIMELINE_ENTRIES,
  BotRoster,
  toBotHandle,
  handleBotRequest,
};
