/**
 * Real-platform check for SPEC-AGENT-BOTS §11.3: reply capture rate per webview bot.
 *
 * Sends N probe messages to each bot through the running Studio bridge
 * (`POST /api/bots/messages`) and counts how often the captured reply contains the
 * probe's one-time code. Also records each bot's canonical chat URL, so a second run
 * after restarting Studio shows whether the permanent chat survived.
 *
 *   node scripts/bots-capture-check.mjs                    # every webview bot, 10 runs each
 *   node scripts/bots-capture-check.mjs --bots claude,chatgpt --runs 3
 *
 * Options: --runs <n> (10), --bots <handle|platform,...>, --port <n> (8765),
 * --target <ratio> (0.9). Reports go to ~/.nomad/capture-checks/<timestamp>.json.
 * The auth token is read from NOMAD_DAEMON_TOKEN or ~/.nomad/daemon-token and is never printed.
 */

/* oxlint-disable no-console -- local CLI check; printing progress and the summary is its job */

import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const WEBVIEW_PLATFORMS = ['claude', 'chatgpt', 'gemini', 'grok', 'deepseek', 'perplexity'];
const REPORT_DIR = path.join(homedir(), '.nomad', 'capture-checks');
const DEFAULTS = { runs: 10, port: 8765, target: 0.9, bots: [] };

/** @param {string} handle @param {number} run @param {string} [salt] */
export function buildProbe(handle, run, salt = randomBytes(3).toString('hex')) {
  const code = `NC-${handle}-${run}-${salt}`;
  return {
    code,
    message: `Automated reply-capture check. Reply with exactly this code and nothing else: ${code}`,
  };
}

/**
 * @param {{ success: boolean, data?: { reply?: string }, errorCode?: string, message?: string }} result
 * @param {string} code
 * @returns {'captured' | 'mismatch' | 'blocked' | 'timeout' | 'error'}
 */
export function classifyResult(result, code) {
  if (result?.success)
    return String(result.data?.reply || '').includes(code) ? 'captured' : 'mismatch';
  if (/blocked/i.test(String(result?.message || ''))) return 'blocked';
  if (result?.errorCode === 'BOT_RESPONSE_TIMEOUT_005') return 'timeout';
  return 'error';
}

/**
 * @param {Array<{ bot: string, outcome: string, chatUrl: string | null }>} records
 * @param {number} target - required captured ratio
 */
export function summarize(records, target) {
  /** @type {Record<string, { runs: number, captured: number, outcomes: Record<string, number>, chatUrls: string[], pass: boolean }>} */
  const byBot = {};
  for (const r of records) {
    const s = (byBot[r.bot] ??= {
      runs: 0,
      captured: 0,
      outcomes: {},
      chatUrls: [],
      pass: false,
    });
    s.runs += 1;
    if (r.outcome === 'captured') s.captured += 1;
    s.outcomes[r.outcome] = (s.outcomes[r.outcome] || 0) + 1;
    if (r.chatUrl && !s.chatUrls.includes(r.chatUrl)) s.chatUrls.push(r.chatUrl);
  }
  for (const s of Object.values(byBot)) s.pass = s.runs > 0 && s.captured / s.runs >= target;
  return byBot;
}

/**
 * Which bots kept the same canonical chat as the previous report's last URL.
 * @param {Record<string, { chatUrls: string[] }>} previous
 * @param {Record<string, { chatUrls: string[] }>} current
 */
export function compareChats(previous, current) {
  /** @type {Record<string, boolean>} */
  const kept = {};
  for (const [bot, s] of Object.entries(current)) {
    const before = previous?.[bot]?.chatUrls?.at(-1);
    if (before && s.chatUrls.length > 0) kept[bot] = s.chatUrls[0] === before;
  }
  return kept;
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (flag === '--runs') opts.runs = Math.max(1, Number(value) || DEFAULTS.runs);
    else if (flag === '--port') opts.port = Number(value) || DEFAULTS.port;
    else if (flag === '--target') opts.target = Number(value) || DEFAULTS.target;
    else if (flag === '--bots')
      opts.bots = String(value || '')
        .split(',')
        .filter(Boolean);
    else throw new Error(`Unknown option ${flag}`);
  }
  return opts;
}

function readToken() {
  if (process.env.NOMAD_DAEMON_TOKEN) return process.env.NOMAD_DAEMON_TOKEN;
  return readFileSync(path.join(homedir(), '.nomad', 'daemon-token'), 'utf8').trim();
}

function latestReport() {
  try {
    const files = readdirSync(REPORT_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();
    return files.length
      ? JSON.parse(readFileSync(path.join(REPORT_DIR, files.at(-1)), 'utf8'))
      : null;
  } catch {
    return null;
  }
}

/** @param {number} port @param {string} token */
function client(port, token) {
  return async (/** @type {string} */ route, /** @type {unknown} */ body) => {
    const res = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return res.json();
  };
}

/** @param {ReturnType<typeof client>} api @param {any} bot @param {number} runs */
async function probeBot(api, bot, runs) {
  const records = [];
  for (let run = 1; run <= runs; run += 1) {
    const probe = buildProbe(bot.handle, run);
    const started = Date.now();
    const result = await api('/api/bots/messages', {
      to: bot.id,
      message: probe.message,
    });
    const after = await api(`/api/bots/${encodeURIComponent(bot.id)}`);
    const outcome = classifyResult(result, probe.code);
    const record = {
      bot: bot.handle,
      run,
      outcome,
      ms: Date.now() - started,
      state: after?.data?.state ?? null,
      chatUrl: after?.data?.canonicalChat?.url ?? null,
      error: result?.success ? null : `${result?.errorCode}: ${result?.message}`,
    };
    console.log(
      `@${bot.handle} #${run}: ${outcome} (${record.ms} ms)${record.error ? ' ' + record.error : ''}`,
    );
    records.push(record);
  }
  return records;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const api = client(opts.port, readToken());
  const listed = await api('/api/bots');
  if (!listed?.success)
    throw new Error(`Cannot list bots: ${listed?.message || 'is Studio running?'}`);
  const wanted = (/** @type {any} */ b) =>
    opts.bots.length
      ? opts.bots.includes(b.handle) || opts.bots.includes(b.platform)
      : WEBVIEW_PLATFORMS.includes(b.platform);
  const bots = listed.data.filter(wanted);
  if (bots.length === 0) throw new Error('No matching webview bots in the roster');

  // Platforms run in parallel (separate webviews); runs for one bot stay sequential.
  const records = (await Promise.all(bots.map((b) => probeBot(api, b, opts.runs)))).flat();
  const summary = summarize(records, opts.target);
  const chatKept = compareChats(latestReport()?.summary, summary);

  console.log('\nbot | captured | pass | chats | same chat as last report');
  for (const [bot, s] of Object.entries(summary)) {
    const kept = bot in chatKept ? (chatKept[bot] ? 'yes' : 'NO') : '-';
    console.log(
      `@${bot} | ${s.captured}/${s.runs} | ${s.pass ? 'PASS' : 'FAIL'} | ${s.chatUrls.length} | ${kept}`,
    );
  }

  mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ opts, summary, chatKept, records }, null, 2));
  console.log(`\nReport: ${file}`);
  process.exitCode = Object.values(summary).every((s) => s.pass) ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  });
}
