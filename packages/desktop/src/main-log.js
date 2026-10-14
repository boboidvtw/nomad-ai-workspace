/**
 * Nomad AI Studio - Main-process log file
 * The packaged app has no terminal, so console output from main.js disappears. This tees
 * console.log/info/warn/error into <dir>/main.log (Electron's logs path, on macOS
 * ~/Library/Logs/Nomad AI Studio/) and rotates to main.log.1 past maxBytes. Writing is
 * synchronous so the last lines before a crash survive; a failed write is dropped silently
 * because logging must never take the app down.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');

const DEFAULT_MAX_BYTES = 1024 * 1024;
const LOG_NAME = 'main.log';

/** @param {unknown} value */
function stringify(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return util.inspect(value, { depth: 2, breakLength: Infinity });
  }
}

/**
 * @param {string} level
 * @param {unknown[]} args
 * @param {() => Date} [now]
 */
function formatLine(level, args, now = () => new Date()) {
  return `${now().toISOString()} [${level}] ${args.map(stringify).join(' ')}\n`;
}

/**
 * @param {{ dir: string, maxBytes?: number, now?: () => Date }} options
 * @returns {{ file: string, write: (level: string, args: unknown[]) => void }}
 */
function createFileLogger({ dir, maxBytes = DEFAULT_MAX_BYTES, now }) {
  const file = path.join(dir, LOG_NAME);
  let size = -1;

  /** @param {string} line */
  function append(line) {
    if (size < 0) {
      fs.mkdirSync(dir, { recursive: true });
      size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    }
    const bytes = Buffer.byteLength(line);
    if (size > 0 && size + bytes > maxBytes) {
      fs.renameSync(file, `${file}.1`);
      size = 0;
    }
    fs.appendFileSync(file, line, { mode: 0o600 });
    size += bytes;
  }

  return {
    file,
    write(level, args) {
      try {
        append(formatLine(level, args, now));
      } catch {
        size = -1;
      }
    },
  };
}

/** @type {ReadonlyArray<[keyof Console & ('log'|'info'|'warn'|'error'), string]>} */
const TEED_METHODS = [
  ['log', 'info'],
  ['info', 'info'],
  ['warn', 'warn'],
  ['error', 'error'],
];

/**
 * Wraps the console methods so each call also lands in the log file.
 * @param {Pick<Console, 'log'|'info'|'warn'|'error'>} target
 * @param {{ write: (level: string, args: unknown[]) => void }} logger
 */
function teeConsole(target, logger) {
  for (const [method, level] of TEED_METHODS) {
    const original = target[method].bind(target);
    target[method] = (...args) => {
      original(...args);
      logger.write(level, args);
    };
  }
}

module.exports = { createFileLogger, formatLine, teeConsole };
