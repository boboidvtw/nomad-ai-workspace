const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFileLogger, formatLine, teeConsole } = require('../main-log.js');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-log-'));
}

const FIXED = () => new Date('2026-10-14T06:00:00.000Z');

test('Main log: formatLine stamps level and stringifies errors and objects', () => {
  const err = new Error('boom');
  const line = formatLine('error', ['failed:', err, { a: 1 }], FIXED);
  assert.ok(line.startsWith('2026-10-14T06:00:00.000Z [error] failed: '));
  assert.ok(line.includes('Error: boom'), 'keeps the stack head');
  assert.ok(line.includes('{"a":1}'));
  assert.ok(line.endsWith('\n'));
});

test('Main log: formatLine survives circular objects', () => {
  /** @type {any} */
  const a = {};
  a.self = a;
  assert.doesNotThrow(() => formatLine('info', [a], FIXED));
});

test('Main log: writes lines to <dir>/main.log', () => {
  const dir = tmpDir();
  const logger = createFileLogger({ dir, now: FIXED });
  logger.write('info', ['hello']);
  logger.write('warn', ['careful']);
  assert.strictEqual(logger.file, path.join(dir, 'main.log'));
  const text = fs.readFileSync(logger.file, 'utf8');
  assert.match(text, /\[info\] hello\n/);
  assert.match(text, /\[warn\] careful\n/);
});

test('Main log: rotates to main.log.1 past maxBytes, keeping one old file', () => {
  const dir = tmpDir();
  const logger = createFileLogger({ dir, maxBytes: 200, now: FIXED });
  for (let i = 0; i < 20; i += 1) logger.write('info', [`line ${i} ${'x'.repeat(20)}`]);
  const current = fs.statSync(path.join(dir, 'main.log')).size;
  assert.ok(current <= 200, `current log stays under the cap (${current})`);
  assert.ok(fs.existsSync(path.join(dir, 'main.log.1')));
  assert.ok(!fs.existsSync(path.join(dir, 'main.log.2')));
  assert.match(fs.readFileSync(path.join(dir, 'main.log'), 'utf8'), /line 19/);
});

test('Main log: write never throws when the directory cannot be created', () => {
  const blocker = path.join(tmpDir(), 'file');
  fs.writeFileSync(blocker, '');
  const logger = createFileLogger({ dir: path.join(blocker, 'sub'), now: FIXED });
  assert.doesNotThrow(() => logger.write('info', ['x']));
});

test('Main log: teeConsole forwards to the original console and the file', () => {
  /** @type {string[]} */
  const seen = [];
  /** @type {string[]} */
  const written = [];
  const fakeConsole = {
    log: (/** @type {unknown[]} */ ...a) => seen.push(`log:${a.join(' ')}`),
    info: (/** @type {unknown[]} */ ...a) => seen.push(`info:${a.join(' ')}`),
    warn: (/** @type {unknown[]} */ ...a) => seen.push(`warn:${a.join(' ')}`),
    error: (/** @type {unknown[]} */ ...a) => seen.push(`error:${a.join(' ')}`),
  };
  const logger = {
    file: '',
    write: (/** @type {string} */ l, /** @type {unknown[]} */ a) =>
      written.push(`${l}:${a.join(' ')}`),
  };
  teeConsole(fakeConsole, logger);
  fakeConsole.log('a', 1);
  fakeConsole.warn('b');
  fakeConsole.error('c');
  assert.deepStrictEqual(seen, ['log:a 1', 'warn:b', 'error:c']);
  assert.deepStrictEqual(written, ['info:a 1', 'warn:b', 'error:c']);
});

const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

/**
 * Runs a child that tees its console like main.js does, then logs for a while after the
 * parent closes the child's stdout pipe - what closing the terminal does to `npm start`.
 * @param {string} dir
 */
function runChildAfterTerminalCloses(dir) {
  const script = `
    const { createFileLogger, teeConsole } = require(${JSON.stringify(path.join(__dirname, '../main-log.js'))});
    const logger = createFileLogger({ dir: ${JSON.stringify(dir)} });
    teeConsole(console, logger, { streams: [process.stdout, process.stderr] });
    let n = 0;
    const timer = setInterval(() => {
      console.info('tick', n++);
      if (n === 40) { clearInterval(timer); console.info('done'); }
    }, 5);
  `;
  const child = spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  child.stdout.once('data', () => child.stdout.destroy());
  return new Promise((resolve) => child.on('exit', (code) => resolve({ code, stderr })));
}

test('Main log: closing the terminal does not crash the process with EPIPE', async () => {
  const dir = tmpDir();
  const { code, stderr } = await runChildAfterTerminalCloses(dir);
  assert.strictEqual(code, 0, `child crashed: ${stderr}`);
  assert.doesNotMatch(stderr, /EPIPE/);
  assert.match(fs.readFileSync(path.join(dir, 'main.log'), 'utf8'), /\[info\] done\n/);
});

test('Main log: after a broken pipe the console stops writing there but the file keeps going', () => {
  const dir = tmpDir();
  const logger = createFileLogger({ dir, now: FIXED });
  const stdout = new EventEmitter();
  /** @type {unknown[][]} */
  const printed = [];
  const target = {
    log() {},
    info: (/** @type {unknown[]} */ ...a) => printed.push(a),
    warn() {},
    error() {},
  };
  teeConsole(target, logger, { streams: [stdout] });

  target.info('before');
  const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
  assert.doesNotThrow(() => stdout.emit('error', epipe), 'an EPIPE never becomes uncaught');
  target.info('after');

  assert.deepStrictEqual(printed, [['before']]);
  const text = fs.readFileSync(logger.file, 'utf8');
  assert.match(text, /\[info\] before\n/);
  assert.match(text, /\[info\] after\n/);
});

test('Main log: other stdio errors are logged to the file instead of crashing', () => {
  const dir = tmpDir();
  const logger = createFileLogger({ dir, now: FIXED });
  const stderr = new EventEmitter();
  const target = { log() {}, info() {}, warn() {}, error() {} };
  teeConsole(target, logger, { streams: [stderr] });

  const odd = Object.assign(new Error('write EIO'), { code: 'EIO' });
  assert.doesNotThrow(() => stderr.emit('error', odd));
  assert.match(fs.readFileSync(logger.file, 'utf8'), /\[warn\] .*write EIO/);
});
