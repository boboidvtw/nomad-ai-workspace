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

/** Errors that mean the terminal on the other end of stdout/stderr has gone away. */
const BROKEN_PIPE_CODES = new Set(['EPIPE', 'ERR_STREAM_DESTROYED']);

/**
 * Listens for errors on the console's streams. Started from a terminal (`npm start`), stdout
 * and stderr are pipes: closing the terminal makes the next write fail with EPIPE, and an
 * 'error' event with no listener is an uncaught exception that pops a dialog. After a broken
 * pipe the console stops writing to the terminal; the log file keeps every line.
 * @param {ReadonlyArray<import('events').EventEmitter>} streams
 * @param {{ write: (level: string, args: unknown[]) => void }} logger
 * @returns {{ broken: () => boolean }}
 */
function guardStreams(streams, logger) {
  let broken = false;
  for (const stream of streams) {
    stream.on('error', (/** @type {NodeJS.ErrnoException} */ error) => {
      if (BROKEN_PIPE_CODES.has(String(error && error.code))) {
        broken = true;
        return;
      }
      logger.write('warn', ['console stream error:', error]);
    });
  }
  return { broken: () => broken };
}

/**
 * Wraps the console methods so each call also lands in the log file.
 * @param {Pick<Console, 'log'|'info'|'warn'|'error'>} target
 * @param {{ write: (level: string, args: unknown[]) => void }} logger
 * @param {{ streams?: ReadonlyArray<import('events').EventEmitter> }} [options] - the streams
 *   behind `target` (process.stdout/stderr for the real console), guarded against EPIPE
 */
function teeConsole(target, logger, { streams = [] } = {}) {
  const pipe = guardStreams(streams, logger);
  for (const [method, level] of TEED_METHODS) {
    const original = target[method].bind(target);
    target[method] = (...args) => {
      if (!pipe.broken()) original(...args);
      logger.write(level, args);
    };
  }
}

module.exports = { createFileLogger, formatLine, teeConsole };
