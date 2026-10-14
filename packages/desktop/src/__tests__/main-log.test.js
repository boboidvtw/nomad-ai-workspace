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
