/**
 * @nomad/core - Dashboard service registry
 * The only commands the Dashboard can run. Requests name an id from this list; nothing in a
 * request ever becomes part of a command.
 */

const path = require('node:path');

const TERMINAL_STOP_HINT = '互動工具沒有背景服務。請在終端機結束；這裡不關閉，以免中斷其他工作階段';
const HERMES_GATEWAY_WARNING = '啟動後 Hermes 會連上 Telegram 並開始回覆訊息。確定要啟動嗎？';
const STUDIO_STOP_WARNING = '這會關閉 Nomad AI Studio，Dashboard 也會一起關閉。確定嗎？';
const ORCHESTRATOR_MISSING = '協調器已不在 ~/程式倉庫/Antigravity-Stack，無法啟動';

const DOCKER_TIMEOUT_MS = 180000;
const BUILD_TIMEOUT_MS = 900000;

/**
 * @typedef {Object} ServiceAction
 * @property {'exec' | 'daemon' | 'process' | 'terminal'} kind
 * @property {string} [bin]
 * @property {string[]} [args]
 * @property {string} [cwd]
 * @property {string} [command] - Terminal entries: the program to open
 * @property {number} [port] - Process stops: port the service listens on
 * @property {string} [pattern] - Process stops: pgrep pattern
 * @property {string} [marker] - Process stops: must appear in the command line before any kill
 */

/**
 * @typedef {Object} ServiceDefinition
 * @property {string} id
 * @property {string} label
 * @property {{ type: 'port', port: number } | { type: 'process', pattern: string }} [check]
 * @property {ServiceAction} start
 * @property {ServiceAction | null} stop
 * @property {{ paths?: string[], reason?: string }} [requires]
 * @property {boolean} [needsDocker]
 * @property {number} [timeoutMs]
 * @property {string} [confirmStart]
 * @property {string} [confirmStop]
 * @property {string} [noStopReason]
 */

/**
 * @param {string} id
 * @param {string} label
 * @param {string} cwd
 * @param {number} port
 * @param {string[]} upArgs
 * @param {string[]} downArgs
 * @param {number} [timeoutMs]
 * @returns {ServiceDefinition}
 */
function composeService(id, label, cwd, port, upArgs, downArgs, timeoutMs = DOCKER_TIMEOUT_MS) {
  return {
    id,
    label,
    check: { type: 'port', port },
    requires: { paths: [cwd] },
    needsDocker: true,
    timeoutMs,
    start: { kind: 'exec', bin: 'docker', args: ['compose', ...upArgs], cwd },
    stop: { kind: 'exec', bin: 'docker', args: ['compose', ...downArgs], cwd },
  };
}

/**
 * @param {string} id
 * @param {string} label
 * @param {string} appName
 * @param {string} pattern
 * @returns {ServiceDefinition}
 */
function macAppService(id, label, appName, pattern) {
  return {
    id,
    label,
    check: { type: 'process', pattern },
    requires: { paths: [path.join('/Applications', appName + '.app')] },
    start: { kind: 'exec', bin: '/usr/bin/open', args: ['-a', appName] },
    stop: { kind: 'exec', bin: '/usr/bin/osascript', args: ['-e', `quit app "${appName}"`] },
  };
}

/**
 * @param {string} home
 * @returns {ServiceDefinition[]}
 */
function buildServiceRegistry(home) {
  const laya = path.join(home, '.gemini/antigravity-ide/scratch/laya');
  const comfy = path.join(home, 'Developer/ComfyUI');
  const postgres = path.join(home, 'docker-services/postgres');
  const redis = path.join(home, 'docker-services/redis');
  const maih = path.join(home, 'Developer/maih');
  const orchestrator = path.join(home, '程式倉庫/Antigravity-Stack/orchestration');

  return [
    {
      id: 'laya',
      label: 'Laya',
      check: { type: 'port', port: 8555 },
      requires: { paths: [laya] },
      timeoutMs: 60000,
      start: { kind: 'exec', bin: path.join(laya, 'start_service.sh'), args: [], cwd: laya },
      stop: { kind: 'exec', bin: path.join(laya, 'stop_service.sh'), args: [], cwd: laya },
    },
    {
      id: 'lmstudio',
      label: 'LM Studio API',
      check: { type: 'port', port: 1234 },
      timeoutMs: 60000,
      start: { kind: 'exec', bin: 'lms', args: ['server', 'start', '--port', '1234'] },
      stop: { kind: 'exec', bin: 'lms', args: ['server', 'stop'] },
    },
    {
      id: 'comfyui',
      label: 'ComfyUI',
      check: { type: 'port', port: 8188 },
      requires: { paths: [path.join(comfy, 'venv')] },
      timeoutMs: 120000,
      start: {
        kind: 'daemon',
        bin: path.join(comfy, 'start_comfyui.sh'),
        args: [],
        cwd: comfy,
      },
      stop: { kind: 'process', port: 8188, marker: 'main.py' },
    },
    {
      id: 'hermes-web',
      label: 'Hermes Web',
      check: { type: 'port', port: 9119 },
      timeoutMs: 180000,
      start: {
        kind: 'daemon',
        bin: 'hermes',
        args: ['dashboard', '--no-open', '--host', '127.0.0.1', '--port', '9119'],
      },
      stop: { kind: 'exec', bin: 'hermes', args: ['dashboard', '--stop'] },
    },
    {
      id: 'hermes-gateway',
      label: 'Hermes Telegram 閘道',
      check: { type: 'process', pattern: 'hermes gateway run' },
      timeoutMs: 60000,
      confirmStart: HERMES_GATEWAY_WARNING,
      start: { kind: 'daemon', bin: 'hermes', args: ['gateway', 'run'] },
      stop: { kind: 'process', pattern: 'hermes gateway run', marker: 'gateway run' },
    },
    composeService(
      'maih',
      'MAIH',
      maih,
      3000,
      ['up', '--build', '--detach'],
      ['down'],
      BUILD_TIMEOUT_MS,
    ),
    composeService('postgres', 'PostgreSQL', postgres, 5432, ['up', '-d', 'postgres'], ['down']),
    composeService('redis', 'Redis', redis, 6379, ['up', '-d'], ['down']),
    composeService(
      'adminer',
      'Adminer',
      postgres,
      8080,
      ['up', '-d', 'adminer'],
      ['stop', 'adminer'],
    ),
    macAppService('obsidian', 'Obsidian', 'Obsidian', 'Obsidian\\.app/Contents/MacOS/Obsidian$'),
    {
      ...macAppService(
        'nomad-studio',
        'Nomad AI Studio',
        'Nomad AI Studio',
        'Nomad AI Studio\\.app/Contents/MacOS/Nomad AI Studio$',
      ),
      confirmStop: STUDIO_STOP_WARNING,
    },
    {
      id: 'claude-cli',
      label: 'Claude Code',
      start: { kind: 'terminal', command: 'claude' },
      stop: null,
      noStopReason: TERMINAL_STOP_HINT,
    },
    {
      id: 'codex-cli',
      label: 'Codex',
      start: { kind: 'terminal', command: 'codex' },
      stop: null,
      noStopReason: TERMINAL_STOP_HINT,
    },
    {
      id: 'nomad-cli',
      label: 'Nomad 協調器',
      requires: { paths: [orchestrator], reason: ORCHESTRATOR_MISSING },
      start: { kind: 'terminal', command: path.join(home, '.gemini/scripts/nomad-cli status') },
      stop: null,
      noStopReason: '協調器是單次指令，沒有背景服務',
    },
  ];
}

module.exports = { buildServiceRegistry };
