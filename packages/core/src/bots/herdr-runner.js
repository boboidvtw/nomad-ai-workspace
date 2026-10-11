/**
 * Nomad Shared Core - herdr runner (SPEC-AGENT-BOTS M7)
 * Lets a bot be a CLI coding agent (Claude Code, Codex, ...) running in a herdr pane.
 * Contract taken from herdr v0.9.3 (src/cli/agent.rs, skills/herdr/SKILL.md):
 *   herdr agent prompt <name> <text> --wait --timeout <ms>
 *     -> stdout JSON { result: { type: 'agent_prompted', agent: { agent_status } } }, exit 0
 *     -> stderr JSON { error: { code, message } }, exit 1
 *   herdr agent read <name> --source recent-unwrapped --lines <n>  -> plain text
 * The bot's handle doubles as the herdr agent name (both match [a-z][a-z0-9_-]{0,31}).
 * Arguments go through execFile, never a shell.
 * Governed by AGENTS.md Section 6 Result Pattern & Error Codes.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

const AGENT_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const MAX_PROMPT_BYTES = 8 * 1024;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_READ_LINES = 200;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

/**
 * @typedef {(file: string, args: string[], options?: Record<string, unknown>) => Promise<{ stdout: string, stderr: string }>} ExecFileFn
 */

/**
 * @param {unknown} error
 * @returns {{ code: string, message: string, missing: boolean }}
 */
function describeExecError(error) {
  const e = /** @type {{ code?: unknown, stderr?: unknown, message?: unknown }} */ (error || {});
  if (e.code === 'ENOENT')
    return { code: 'ENOENT', message: 'herdr is not installed', missing: true };
  try {
    const parsed = JSON.parse(String(e.stderr || ''));
    if (parsed?.error) {
      return {
        code: String(parsed.error.code || 'error'),
        message: String(parsed.error.message || ''),
        missing: false,
      };
    }
  } catch {}
  return {
    code: String(e.code ?? 'error'),
    message: String(e.stderr || e.message || ''),
    missing: false,
  };
}

/**
 * @param {Object} [options]
 * @param {ExecFileFn} [options.execFile]
 * @param {string} [options.binary='herdr']
 * @param {number} [options.timeoutMs]
 * @param {number} [options.readLines]
 */
function createHerdrRunner(options = {}) {
  const exec = options.execFile || /** @type {ExecFileFn} */ (promisify(execFile));
  const binary = options.binary || 'herdr';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const readLines = options.readLines ?? DEFAULT_READ_LINES;
  const execOptions = { timeout: timeoutMs + 10000, maxBuffer: MAX_OUTPUT_BYTES };

  /**
   * @param {import('./bot-roster').Bot} bot
   * @param {string} text
   * @returns {Promise<import('../result').UnitResult<{ text: string }>>}
   */
  async function run(bot, text) {
    const name = bot.canonicalChat?.herdrAgentName || bot.handle;
    if (!AGENT_NAME_PATTERN.test(String(name || ''))) {
      return err(ErrorCodes.BOT_MESSAGE_INVALID_008, `"${name}" is not a valid herdr agent name`);
    }
    if (!text || Buffer.byteLength(text, 'utf8') > MAX_PROMPT_BYTES) {
      return err(ErrorCodes.BOT_MESSAGE_INVALID_008, `Prompt must be 1-${MAX_PROMPT_BYTES} bytes`);
    }

    let status;
    try {
      const prompted = await exec(
        binary,
        ['agent', 'prompt', name, text, '--wait', '--timeout', String(timeoutMs)],
        execOptions,
      );
      status = JSON.parse(prompted.stdout || '{}')?.result?.agent?.agent_status;
    } catch (e) {
      const failure = describeExecError(e);
      if (failure.missing) return err(ErrorCodes.BOT_HERDR_UNAVAILABLE_010, failure.message);
      return err(
        ErrorCodes.BOT_HERDR_FAILED_011,
        `herdr agent prompt failed (${failure.code}): ${failure.message}`,
        { blocked: failure.code === 'agent_blocked' },
      );
    }
    if (status === 'blocked') {
      return err(ErrorCodes.BOT_HERDR_FAILED_011, `herdr agent ${name} is waiting for approval`, {
        blocked: true,
        reason: 'herdr agent is waiting at an approval or question prompt',
      });
    }

    try {
      const read = await exec(
        binary,
        ['agent', 'read', name, '--source', 'recent-unwrapped', '--lines', String(readLines)],
        execOptions,
      );
      return ok({ text: String(read.stdout || '').trim() });
    } catch (e) {
      const failure = describeExecError(e);
      return err(
        ErrorCodes.BOT_HERDR_FAILED_011,
        `herdr agent read failed (${failure.code}): ${failure.message}`,
      );
    }
  }

  return {
    run,
    /** @returns {Promise<boolean>} */
    async isAvailable() {
      try {
        await exec(binary, ['--version'], { timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    },
  };
}

module.exports = {
  HERDR_AGENT_NAME_PATTERN: AGENT_NAME_PATTERN,
  createHerdrRunner,
};
