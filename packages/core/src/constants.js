/**
 * Nomad Shared Core - System Constants & Topologies
 */

const DEFAULT_DAEMON_PORT = 8765;
const DEFAULT_DAEMON_HOST = '127.0.0.1';

/**
 * @typedef {Object} MonitoredService
 * @property {string} id
 * @property {string} name
 * @property {number} port
 * @property {string} host
 * @property {string} category
 * @property {boolean} essential
 */

/**
 * @typedef {Object} PlatformConfig
 * @property {string} id
 * @property {string} name
 * @property {string} defaultUrl
 * @property {string} color
 */

/** @type {readonly MonitoredService[]} */
const MONITORED_SERVICES = Object.freeze([
  { id: 'nomad_gateway', name: 'Nomad Daemon Gateway', port: 8765, host: '127.0.0.1', category: 'gateway', essential: true },
  { id: 'postgres', name: 'PostgreSQL 16 (OrbStack)', port: 5432, host: '127.0.0.1', category: 'database', essential: false },
  { id: 'redis', name: 'Redis 7 (OrbStack)', port: 6379, host: '127.0.0.1', category: 'cache', essential: false },
  { id: 'adminer', name: 'Postgres Adminer', port: 8080, host: '127.0.0.1', category: 'tool', essential: false },
  { id: 'lmstudio', name: 'LM Studio Inference', port: 1234, host: '127.0.0.1', category: 'ai-engine', essential: false },
  { id: 'hermes_ws', name: 'Hermes Workspace', port: 8787, host: '127.0.0.1', category: 'agent', essential: false }
]);

const PLATFORMS = Object.freeze({
  chatgpt: { id: 'chatgpt', name: 'ChatGPT', defaultUrl: 'https://chatgpt.com', color: '#10A37F' },
  claude: { id: 'claude', name: 'Claude', defaultUrl: 'https://claude.ai', color: '#D97706' },
  gemini: { id: 'gemini', name: 'Gemini', defaultUrl: 'https://gemini.google.com', color: '#2563EB' },
  grok: { id: 'grok', name: 'Grok', defaultUrl: 'https://grok.com', color: '#1D9BF0' },
  deepseek: { id: 'deepseek', name: 'DeepSeek', defaultUrl: 'https://chat.deepseek.com', color: '#4D6BFE' },
  perplexity: { id: 'perplexity', name: 'Perplexity', defaultUrl: 'https://www.perplexity.ai', color: '#22B8CD' }
});

const LAYOUTS = Object.freeze(['focus', 'dual', 'triple', 'quad', 'hexa', 'custom']);

const SEMANTIC_TYPES = Object.freeze([
  '功能',
  '修復',
  '設計',
  '優化',
  '文件',
  '探索',
  '研究',
  '發布'
]);

module.exports = {
  DEFAULT_DAEMON_PORT,
  DEFAULT_DAEMON_HOST,
  MONITORED_SERVICES,
  PLATFORMS,
  LAYOUTS,
  SEMANTIC_TYPES
};
