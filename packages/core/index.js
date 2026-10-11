/**
 * @nomad/core entry point
 * Complete Ecosystem: Result, Constants, Extensions, Pipeline, Sync, Canvas, Local Client, Diff, Memory, MCP, RAG, Plugins
 *
 * Types are generated from the JSDoc in these sources into ./types (`npm run build:types`);
 * do not hand-edit the .d.ts files.
 */

/**
 * @template T
 * @typedef {import('./src/result').UnitSuccess<T>} UnitSuccess
 */
/**
 * @template [E=string]
 * @typedef {import('./src/result').UnitFailure<E>} UnitFailure
 */
/**
 * @template T
 * @template [E=string]
 * @typedef {import('./src/result').UnitResult<T, E>} UnitResult
 */
/** @typedef {import('./src/error-codes').ErrorCode} ErrorCode */
/** @typedef {import('./src/bots/bot-roster').Bot} Bot */
/** @typedef {import('./src/bots/bot-routes').BotServices} BotServices */
/** @typedef {import('./src/constants').MonitoredService} MonitoredService */
/** @typedef {import('./src/constants').PlatformConfig} PlatformConfig */
/** @typedef {import('./src/extensions/template-parser').TemplateVariable} TemplateVariable */
/** @typedef {import('./src/extensions/markdown-exporter').ChatMessage} ChatMessage */
/** @typedef {import('./src/extensions/markdown-exporter').ChatExportOptions} ChatExportOptions */

const { ok, err, isOk, isErr, wrapAsync } = require('./src/result');
const { ErrorCodes } = require('./src/error-codes');
const {
  DEFAULT_DAEMON_PORT,
  DEFAULT_DAEMON_HOST,
  MONITORED_SERVICES,
  PLATFORMS,
  LAYOUTS,
  SEMANTIC_TYPES,
} = require('./src/constants');

const { extractVariables, interpolate } = require('./src/extensions/template-parser');
const { formatChatToMarkdown } = require('./src/extensions/markdown-exporter');

// Pipeline (Headroom & Laya)
const { estimateTokens, compress } = require('./src/pipeline/headroom');
const { decide } = require('./src/pipeline/laya');
const { PipelineManager } = require('./src/pipeline/index');

// Universal Google Drive Sync
const {
  DRIVE_FOLDER_NAME,
  WORKSPACES_FILE_NAME,
  SETTINGS_FILE_NAME,
  MANIFEST_FILE_NAME,
  detectLocalDriveFolder,
  computeChecksum,
  exportToDrive,
  importFromDrive,
  getSyncStatus,
} = require('./src/sync/universal-drive-sync');

// P1: Canvas & Artifacts
const {
  ARTIFACT_TYPES,
  extractArtifacts,
  generateSandboxHtml,
} = require('./src/canvas/artifact-extractor');

// P2: Local Model Client (Dual-Track)
const { LocalModelClient } = require('./src/client/local-model-client');

// Microservice health probe (Daemon & Bridge)
const { probePort, probeAllServices } = require('./src/probe/prober');

// Local gateway auth (Daemon & Bridge)
const {
  resolveAuthToken,
  getTokenFilePath,
  isLoopbackHostname,
  isLoopbackModelTarget,
  applyCorsHeaders,
  authorizeRequest,
  injectDashboardAuth,
} = require('./src/security/local-auth');

// P2: Side-by-Side Diff Engine
const { computeDiff } = require('./src/diff/diff-engine');

// P2: Vector Memory Lite & Hybrid Search
const { tokenize, VectorMemoryLite } = require('./src/memory/vector-memory-lite');

// P3: Model Context Protocol (MCP) Host & Gateway
const {
  McpGateway,
  ALLOWED_PATHS_ENV: MCP_ALLOWED_PATHS_ENV,
  defaultAllowedPaths,
  defaultDeniedPaths,
} = require('./src/mcp/mcp-gateway');

// P3: Local Knowledge Base & RAG Pipeline
const { KnowledgeBase } = require('./src/rag/knowledge-base');

// Task Control Plane (Paperclip Native Integration)
const {
  TASK_STATUS,
  TASK_PRIORITY,
  validateTransition,
  createTaskEntity,
  AGENT_STATUS,
  DEFAULT_ROSTER,
  AgentRoster,
  TaskDispatcher,
  ApprovalGate,
  TaskRunner,
  RecurringScheduler,
  DEFAULT_PRESET_SCHEDULES,
  routineLabel,
} = require('./src/tasks/index');

// Bots (SPEC-AGENT-BOTS)
const {
  BOT_STATE,
  DEFAULT_ROSTER_PATH,
  BotRoster,
  toBotHandle,
  handleBotRequest,
  NEW_CHAT_URLS,
  normalizeChatUrl,
  isConversationUrl,
  isSameConversation,
  BLOCKED_MANIFESTS,
  detectBlocked,
  buildStateSnapshotScript,
} = require('./src/bots/index');

// P3: Nomad Plugin Runtime
const { PluginRuntime } = require('./src/plugins/plugin-runtime');

const ArtifactExtractor = {
  extract: extractArtifacts,
  extractArtifacts,
  generateSandboxHtml,
};

const DiffEngine = {
  diffLines: computeDiff,
  computeDiff,
};

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
  // Pipeline
  estimateTokens,
  compress,
  decide,
  PipelineManager,
  // Universal Sync
  DRIVE_FOLDER_NAME,
  WORKSPACES_FILE_NAME,
  SETTINGS_FILE_NAME,
  MANIFEST_FILE_NAME,
  detectLocalDriveFolder,
  computeChecksum,
  exportToDrive,
  importFromDrive,
  getSyncStatus,
  // P1: Canvas
  ARTIFACT_TYPES,
  extractArtifacts,
  generateSandboxHtml,
  ArtifactExtractor,
  DiffEngine,
  // P2: Local Client, Diff & Memory
  LocalModelClient,
  computeDiff,
  tokenize,
  VectorMemoryLite,
  // P3: MCP, RAG & Plugins
  McpGateway,
  MCP_ALLOWED_PATHS_ENV,
  defaultAllowedPaths,
  defaultDeniedPaths,
  KnowledgeBase,
  PluginRuntime,
  // Task Control Plane
  TASK_STATUS,
  TASK_PRIORITY,
  validateTransition,
  createTaskEntity,
  AGENT_STATUS,
  DEFAULT_ROSTER,
  AgentRoster,
  TaskDispatcher,
  ApprovalGate,
  TaskRunner,
  RecurringScheduler,
  DEFAULT_PRESET_SCHEDULES,
  routineLabel,
  // Bots
  BOT_STATE,
  DEFAULT_ROSTER_PATH,
  BotRoster,
  toBotHandle,
  handleBotRequest,
  NEW_CHAT_URLS,
  normalizeChatUrl,
  isConversationUrl,
  isSameConversation,
  BLOCKED_MANIFESTS,
  detectBlocked,
  buildStateSnapshotScript,
  // Microservice health probe
  probePort,
  probeAllServices,
  // Local gateway auth
  resolveAuthToken,
  getTokenFilePath,
  isLoopbackHostname,
  isLoopbackModelTarget,
  applyCorsHeaders,
  authorizeRequest,
  injectDashboardAuth,
};
