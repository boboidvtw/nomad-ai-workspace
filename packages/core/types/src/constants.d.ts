export type MonitoredService = {
    id: string;
    name: string;
    port: number;
    host: string;
    category: string;
    essential: boolean;
};
export type PlatformConfig = {
    id: string;
    name: string;
    defaultUrl: string;
    color: string;
};
/**
 * Nomad Shared Core - System Constants & Topologies
 */
export const DEFAULT_DAEMON_PORT: 8765;
/** ~/.nomad holds chat URLs, transcripts and prompts: owner-only, like daemon-token. */
export const PRIVATE_FILE_MODE: 384;
export const PRIVATE_DIR_MODE: 448;
export const DEFAULT_DAEMON_HOST: "127.0.0.1";
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
export const MONITORED_SERVICES: readonly MonitoredService[];
export const PLATFORMS: Readonly<{
    chatgpt: {
        id: string;
        name: string;
        defaultUrl: string;
        color: string;
    };
    claude: {
        id: string;
        name: string;
        defaultUrl: string;
        color: string;
    };
    gemini: {
        id: string;
        name: string;
        defaultUrl: string;
        color: string;
    };
    grok: {
        id: string;
        name: string;
        defaultUrl: string;
        color: string;
    };
    copilot: {
        id: string;
        name: string;
        defaultUrl: string;
        color: string;
    };
    perplexity: {
        id: string;
        name: string;
        defaultUrl: string;
        color: string;
    };
}>;
export const LAYOUTS: readonly string[];
export const SEMANTIC_TYPES: readonly string[];
