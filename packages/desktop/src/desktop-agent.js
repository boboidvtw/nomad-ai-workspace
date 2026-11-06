/**
 * Nomad AI Studio - Desktop Agent
 * A local model (LM Studio / any OpenAI-compatible server with `tools`) drives
 * agent-desktop (https://github.com/vercel-labs/agent-desktop, Apache-2.0) to operate a
 * macOS app through its accessibility tree: snapshot → act → snapshot to verify → done.
 *
 * Only four tools exist: snapshot / click / type / done. There is no press, launch,
 * close-app, delete or save, so the model cannot send key combos or open and quit apps.
 * Snapshots contain private desktop content: callers must not write them to logs.
 *
 * The loop and helpers here are pure; process and HTTP I/O live in desktop-agent-io.js.
 */

const DEFAULT_MAX_STEPS = 8;
const MAX_STEPS_LIMIT = 20;
const MAX_SNAPSHOT_CHARS = 40_000; // ~15k tokens; older snapshots are dropped from history
const STALE_SNAPSHOT_TEXT = '[older snapshot omitted; refs from it are stale]';
const SUMMARY_CHARS = 200;

/**
 * Snapshot errors the model cannot fix with the allowed tools (it cannot launch apps or
 * grant permissions), so the run ends instead of snapshotting until the step limit.
 */
const FATAL_SNAPSHOT_HINTS = Object.freeze({
  APP_NOT_FOUND: 'the app is not running; open it first',
  WINDOW_NOT_FOUND: 'the app has no open window; open one first',
  PERM_DENIED:
    'Accessibility permission is missing for the app that runs agent-desktop (System Settings > Privacy & Security); run `agent-desktop permissions --guide`',
});

/** The only tools the model is offered or allowed to call. */
const ALLOWED_TOOLS = Object.freeze(['snapshot', 'click', 'type', 'done']);

const TOOL_SCHEMAS = Object.freeze([
  {
    type: 'function',
    function: {
      name: 'snapshot',
      description:
        "Read the app's UI elements. Returns a tree; each element has a ref_id like @sXXXX:eN.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'click',
      description:
        'Click an element. ref must be copied exactly from the latest snapshot, including the leading @.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'string' } },
        required: ['ref'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'type',
      description:
        'Insert text into a text element (text area / text field). ref from the latest snapshot.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'string' }, text: { type: 'string' } },
        required: ['ref', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'done',
      description: 'Call when the task is finished and verified.',
      parameters: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
      },
    },
  },
]);

/**
 * @typedef {{ ok?: boolean | string, data?: any, error?: { code?: string, message?: string } | string | null }} DesktopEnvelope
 * @typedef {(args: string[], options?: { stdin?: string, signal?: AbortSignal }) => Promise<DesktopEnvelope>} DesktopExec
 * @typedef {{ id: string, type?: string, function: { name: string, arguments?: string } }} ToolCall
 * @typedef {{ role: string, content: string, tool_calls?: ToolCall[], tool_call_id?: string, isSnapshot?: boolean }} AgentMessage
 * @typedef {{ content?: string | null, tool_calls?: ToolCall[] }} AssistantMessage
 * @typedef {(request: { model: string, messages: object[], tools: readonly object[], signal?: AbortSignal }) => Promise<AssistantMessage>} ChatFn
 * @typedef {{ step: number, kind: 'tool' | 'note' | 'done' | 'end', tool?: string, args?: Record<string, unknown>, summary?: string, ok?: boolean | string, elapsedMs: number }} AgentStep
 * @typedef {{ ok: boolean, answer?: string, reason?: 'done' | 'aborted' | 'max_steps' | 'model_error' | 'desktop_error', error?: string, steps: number, elapsedMs: number }} AgentResult
 */

/**
 * Local models often drop the leading `@` (`s1:e5`), which agent-desktop rejects.
 * @param {unknown} raw
 * @returns {string}
 */
function fixRef(raw) {
  const ref = String(raw ?? '').trim();
  return ref && !ref.startsWith('@') ? `@${ref}` : ref;
}

/**
 * Keeps only what the model needs. `value` must stay: Finder list items carry the file
 * name there, not in `name`.
 * @param {any} node
 * @returns {Record<string, unknown>}
 */
function compactTree(node) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (!node || typeof node !== 'object') return out;
  for (const key of ['role', 'name', 'value', 'ref_id']) {
    const v = node[key];
    if (v !== undefined && v !== null && v !== '') out[key] = v;
  }
  const kids = Array.isArray(node.children) ? node.children.map(compactTree) : [];
  if (kids.length) out.children = kids;
  return out;
}

/**
 * @param {DesktopEnvelope} env
 * @returns {{ code: string, message: string }}
 */
function errorOf(env) {
  const e = env?.error;
  if (!e) return { code: '', message: '' };
  if (typeof e === 'string') return { code: '', message: e };
  return { code: String(e.code || ''), message: String(e.message || '') };
}

/**
 * macOS AX often reports "mutation outcome is uncertain" for clicks that worked. Passing
 * that through makes the model click again; ask it to verify instead.
 * @param {DesktopEnvelope} env
 * @param {string} ref
 * @returns {string}
 */
function actionResult(env, ref) {
  const { code, message } = errorOf(env);
  if (!env?.ok && /uncertain/i.test(message)) {
    return JSON.stringify({
      ok: 'unknown',
      ref,
      hint: 'The action was sent but its effect is unverified. Take a snapshot and check before doing anything else.',
    });
  }
  const error = code || message ? { code: code || undefined, message: message || undefined } : null;
  return JSON.stringify({ ok: Boolean(env?.ok), error, ref });
}

/**
 * Returns a copy of the history where every earlier snapshot is replaced by a placeholder,
 * so only the newest one costs context.
 * @param {AgentMessage[]} messages
 * @returns {AgentMessage[]}
 */
function pruneSnapshots(messages) {
  return messages.map((m) =>
    m.role === 'tool' && m.isSnapshot ? { ...m, content: STALE_SNAPSHOT_TEXT } : m,
  );
}

/**
 * The wire format: internal flags removed.
 * @param {AgentMessage[]} messages
 * @returns {object[]}
 */
function toWireMessages(messages) {
  return messages.map(({ isSnapshot: _isSnapshot, ...rest }) => rest);
}

/**
 * @param {string} app
 * @param {string} [windowTitle]
 * @returns {string}
 */
function buildSystemPrompt(app, windowTitle = '') {
  const scope = windowTitle ? ` (window '${windowTitle}')` : '';
  return (
    `You operate the macOS app '${app}'${scope} via tools. Loop: snapshot -> act -> snapshot to verify. ` +
    'Refs are only valid for the latest snapshot. Only click what the task requires; ' +
    'never open files or apps unless asked. Reading information needs no click. ' +
    'Call done as soon as the task is verified.'
  );
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function clampSteps(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_STEPS;
  return Math.min(n, MAX_STEPS_LIMIT);
}

/**
 * @param {string | undefined} raw
 * @returns {{ args: Record<string, unknown>, error?: string }}
 */
function parseArgs(raw) {
  if (!raw) return { args: {} };
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? { args: parsed } : { args: {} };
  } catch {
    return { args: {}, error: 'arguments are not valid JSON' };
  }
}

/** Models with reasoning output put `<think>` blocks in content; the UI only needs the rest. */
function stripThinking(/** @type {string} */ text) {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/**
 * Per-run settings and window choice. Refs belong to one snapshot of one window, so once a
 * window is picked every later snapshot stays on it instead of jumping to whichever is
 * focused. `headed` allows physical typing as a last resort (it takes focus and the cursor).
 * @typedef {{ windowTitle: string, windowId: string, headed: boolean }} RunScope
 */

/**
 * @param {DesktopExec} exec
 * @param {string} app
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<any[]>}
 */
async function listWindows(exec, app, signal) {
  const windows = await exec(['list-windows', '--app', app], { signal });
  return Array.isArray(windows?.data) ? windows.data : [];
}

/**
 * @param {DesktopExec} exec
 * @param {string} app
 * @param {AbortSignal | undefined} signal
 * @param {RunScope} scope
 * @returns {Promise<{ content: string, summary: string, ok: boolean, fatal?: string }>}
 */
async function takeSnapshot(exec, app, signal, scope) {
  // No -i: list item names live in `value` and -i drops them.
  /** @type {DesktopEnvelope | undefined} */
  let env;
  if (scope.windowId) {
    env = await exec(['snapshot', '--app', app, '--window-id', scope.windowId], { signal });
    // The picked window was closed: choose again below.
    if (!env?.ok && errorOf(env).code === 'WINDOW_NOT_FOUND') scope.windowId = '';
  }
  if (!scope.windowId && scope.windowTitle) {
    const wanted = scope.windowTitle.toLowerCase();
    const list = await listWindows(exec, app, signal);
    const pick =
      list.find(
        (w) =>
          w?.visible &&
          String(w.title || '')
            .toLowerCase()
            .includes(wanted),
      ) ||
      list.find((w) =>
        String(w.title || '')
          .toLowerCase()
          .includes(wanted),
      );
    if (!pick?.id) {
      const error = {
        code: 'WINDOW_NOT_FOUND',
        message: `no window titled '${scope.windowTitle}'`,
      };
      const content = JSON.stringify({ ok: false, error });
      return {
        content,
        summary: content.slice(0, SUMMARY_CHARS),
        ok: false,
        fatal: `WINDOW_NOT_FOUND: ${app} has no window titled '${scope.windowTitle}'; open it first`,
      };
    }
    scope.windowId = String(pick.id);
    env = await exec(['snapshot', '--app', app, '--window-id', scope.windowId], { signal });
  }
  if (!env) env = await exec(['snapshot', '--app', app], { signal });
  if (!env?.ok && /AMBIGUOUS_TARGET/i.test(`${errorOf(env).code} ${errorOf(env).message}`)) {
    const list = await listWindows(exec, app, signal);
    const pick = list.find((w) => w?.is_focused) || list.find((w) => w?.visible) || list[0];
    if (pick?.id) {
      scope.windowId = String(pick.id);
      env = await exec(['snapshot', '--app', app, '--window-id', scope.windowId], { signal });
    }
  }
  if (!env?.ok || !env.data?.tree) {
    const error = errorOf(env);
    const content = JSON.stringify({ ok: false, error });
    const hint =
      FATAL_SNAPSHOT_HINTS[/** @type {keyof typeof FATAL_SNAPSHOT_HINTS} */ (error.code)];
    const fatal = hint ? `${error.code}: ${hint}` : undefined;
    return { content, summary: content.slice(0, SUMMARY_CHARS), ok: false, fatal };
  }
  const content = JSON.stringify(compactTree(env.data.tree)).slice(0, MAX_SNAPSHOT_CHARS);
  const refs = env.data.ref_count ?? '?';
  return { content, summary: `snapshot ok: ${refs} refs, ${content.length} chars`, ok: true };
}

/**
 * Types text. Web fields in Safari and Chromium often accept keystrokes without applying
 * them, which agent-desktop reports as "Post-action state does not match" even when the text
 * did land. Order: (1) if the field already ends with the text, report success rather than
 * typing twice; (2) write current value + text with set-value, which needs no focus or
 * cursor (works for single-line fields, not Safari <textarea>); (3) only when the run allows
 * it, type physically with --headed. Anything else, or every tier failing, returns the
 * original error.
 * @param {DesktopExec} exec
 * @param {string} ref
 * @param {string} text
 * @param {AbortSignal | undefined} signal
 * @param {boolean} headed
 * @returns {Promise<DesktopEnvelope>}
 */
async function typeText(exec, ref, text, signal, headed) {
  // --stdin keeps the text out of the process arguments.
  const env = await exec(['type', ref, '--stdin'], { stdin: text, signal });
  if (env?.ok || !/does not match the requested change/i.test(errorOf(env).message)) return env;
  const current = await exec(['get', ref, '--property', 'value'], { signal });
  const before = current?.ok && typeof current.data?.value === 'string' ? current.data.value : '';
  if (text && before.endsWith(text)) return { ok: true };
  const set = await exec(['set-value', ref, '--stdin'], { stdin: before + text, signal });
  if (set?.ok) return set;
  if (headed) {
    const physical = await exec(['type', ref, '--stdin', '--headed'], { stdin: text, signal });
    if (physical?.ok) return physical;
  }
  return env;
}

/**
 * @param {DesktopExec} exec
 * @param {string} name
 * @param {Record<string, unknown>} args
 * @param {string} app
 * @param {AbortSignal | undefined} signal
 * @param {RunScope} scope
 * @returns {Promise<{ content: string, summary: string, ok: boolean | string, fatal?: string }>}
 */
async function runTool(exec, name, args, app, signal, scope) {
  if (name === 'snapshot') return takeSnapshot(exec, app, signal, scope);
  if (name === 'click' || name === 'type') {
    const ref = fixRef(args.ref);
    const env =
      name === 'click'
        ? await exec(['click', ref], { signal })
        : await typeText(exec, ref, String(args.text ?? ''), signal, scope.headed);
    const content = actionResult(env, ref);
    return { content, summary: content.slice(0, SUMMARY_CHARS), ok: JSON.parse(content).ok };
  }
  const content = JSON.stringify({ ok: false, error: `tool '${name}' is not allowed` });
  return { content, summary: content, ok: false };
}

/**
 * @param {{ exec: DesktopExec, chat: ChatFn, now?: () => number }} deps
 */
function createDesktopAgent({ exec, chat, now = Date.now }) {
  /**
   * @param {{ task: string, app: string, model: string, windowTitle?: string, headed?: boolean, maxSteps?: number, signal?: AbortSignal, onStep?: (step: AgentStep) => void }} options
   * @returns {Promise<AgentResult>}
   */
  async function run({
    task,
    app,
    model,
    windowTitle = '',
    headed = false,
    maxSteps,
    signal,
    onStep = () => {},
  }) {
    const started = now();
    /** @type {RunScope} */
    const scope = {
      windowTitle: String(windowTitle).trim(),
      windowId: '',
      headed: headed === true,
    };
    const limit = clampSteps(maxSteps);
    const elapsed = () => now() - started;
    /** @type {AgentMessage[]} */
    let messages = [
      { role: 'system', content: buildSystemPrompt(app, scope.windowTitle) },
      { role: 'user', content: task },
    ];
    /** @param {Omit<AgentResult, 'elapsedMs'>} r */
    const finish = (r) => {
      const result = { ...r, elapsedMs: elapsed() };
      onStep({
        step: r.steps,
        kind: 'end',
        summary: r.reason,
        ok: r.ok,
        elapsedMs: result.elapsedMs,
      });
      return result;
    };

    for (let step = 1; step <= limit; step++) {
      if (signal?.aborted) return finish({ ok: false, reason: 'aborted', steps: step - 1 });
      /** @type {AssistantMessage} */
      let msg;
      try {
        msg = await chat({
          model,
          messages: toWireMessages(messages),
          tools: TOOL_SCHEMAS,
          signal,
        });
      } catch (e) {
        if (signal?.aborted) return finish({ ok: false, reason: 'aborted', steps: step - 1 });
        const error = e instanceof Error ? e.message : String(e);
        return finish({ ok: false, reason: 'model_error', error, steps: step - 1 });
      }
      const calls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];
      const content = msg?.content || '';
      messages = [...messages, { role: 'assistant', content, tool_calls: calls }];

      if (!calls.length) {
        onStep({
          step,
          kind: 'note',
          summary: stripThinking(content).slice(0, SUMMARY_CHARS),
          elapsedMs: elapsed(),
        });
        messages = [
          ...messages,
          { role: 'user', content: 'Use the tools. Call done when finished.' },
        ];
        continue;
      }

      for (const call of calls) {
        const name = call?.function?.name || '';
        const { args, error: argError } = parseArgs(call?.function?.arguments);
        if (name === 'done' && ALLOWED_TOOLS.includes(name)) {
          const answer = String(args.answer ?? '');
          onStep({
            step,
            kind: 'done',
            tool: 'done',
            args,
            summary: answer,
            ok: true,
            elapsedMs: elapsed(),
          });
          return finish({ ok: true, reason: 'done', answer, steps: step });
        }
        if (signal?.aborted) return finish({ ok: false, reason: 'aborted', steps: step });
        if (name === 'snapshot') messages = pruneSnapshots(messages);
        /** @type {{ content: string, summary: string, ok: boolean | string, fatal?: string }} */
        const result = argError
          ? {
              content: JSON.stringify({ ok: false, error: argError }),
              summary: argError,
              ok: false,
            }
          : await runTool(exec, name, args, app, signal, scope);
        onStep({
          step,
          kind: 'tool',
          tool: name,
          args,
          summary: result.summary,
          ok: result.ok,
          elapsedMs: elapsed(),
        });
        if (result.fatal) {
          return finish({ ok: false, reason: 'desktop_error', error: result.fatal, steps: step });
        }
        messages = [
          ...messages,
          {
            role: 'tool',
            tool_call_id: call.id,
            content: result.content,
            isSnapshot: name === 'snapshot',
          },
        ];
      }
    }
    return finish({ ok: false, reason: 'max_steps', steps: limit });
  }

  return { run };
}

module.exports = {
  ALLOWED_TOOLS,
  TOOL_SCHEMAS,
  DEFAULT_MAX_STEPS,
  MAX_STEPS_LIMIT,
  MAX_SNAPSHOT_CHARS,
  STALE_SNAPSHOT_TEXT,
  fixRef,
  compactTree,
  actionResult,
  pruneSnapshots,
  toWireMessages,
  buildSystemPrompt,
  clampSteps,
  createDesktopAgent,
};
