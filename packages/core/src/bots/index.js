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
const {
  BotLoopGuard,
  BotMessageRouter,
  parseMentions,
  registerMessageAgentTool,
} = require('./message-router');
const {
  NEW_CHAT_URLS,
  normalizeChatUrl,
  isConversationUrl,
  isSameConversation,
} = require('./chat-urls');
const { BLOCKED_MANIFESTS, detectBlocked, buildStateSnapshotScript } = require('./state-manifests');

module.exports = {
  BOT_STATE,
  DEFAULT_ROSTER_PATH,
  MAX_TIMELINE_ENTRIES,
  BotRoster,
  toBotHandle,
  handleBotRequest,
  BotLoopGuard,
  BotMessageRouter,
  parseMentions,
  registerMessageAgentTool,
  NEW_CHAT_URLS,
  normalizeChatUrl,
  isConversationUrl,
  isSameConversation,
  BLOCKED_MANIFESTS,
  detectBlocked,
  buildStateSnapshotScript,
};
