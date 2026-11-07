const test = require('node:test');
const assert = require('node:assert');
const {
  ALLOWED_TOOLS,
  TOOL_SCHEMAS,
  STALE_SNAPSHOT_TEXT,
  fixRef,
  compactTree,
  actionResult,
  pruneSnapshots,
  toWireMessages,
  clampSteps,
  createDesktopAgent,
} = require('../desktop-agent.js');
const { resolveAgentDesktopBin } = require('../desktop-agent-io.js');

test('fixRef: adds the @ local models drop, leaves correct refs alone', () => {
  assert.strictEqual(fixRef('s1:e5'), '@s1:e5');
  assert.strictEqual(fixRef('  s1:e5 '), '@s1:e5');
  assert.strictEqual(fixRef('@s1:e5'), '@s1:e5');
  assert.strictEqual(fixRef(undefined), '');
});

test('compactTree: keeps role/name/value/ref_id, drops the rest, keeps Finder names in value', () => {
  const tree = {
    role: 'window',
    name: 'Applications',
    bounds: { x: 0 },
    states: ['focused'],
    children: [
      { role: 'row', value: 'Safari.app', ref_id: '@s1:e7', actions: ['press'] },
      { role: 'group', name: '', children: [] },
    ],
  };
  assert.deepStrictEqual(compactTree(tree), {
    role: 'window',
    name: 'Applications',
    children: [{ role: 'row', value: 'Safari.app', ref_id: '@s1:e7' }, { role: 'group' }],
  });
});

test('actionResult: an "uncertain" failure becomes ok:unknown with a verify hint', () => {
  const env = {
    ok: false,
    error: { code: 'ACTION_FAILED', message: 'press sent but mutation outcome is uncertain' },
  };
  const out = JSON.parse(actionResult(env, '@s1:e5'));
  assert.strictEqual(out.ok, 'unknown');
  assert.strictEqual(out.ref, '@s1:e5');
  assert.match(out.hint, /snapshot/i);
  assert.strictEqual(out.error, undefined);
});

test('actionResult: real failures and successes pass through', () => {
  const failed = JSON.parse(
    actionResult({ ok: false, error: { code: 'POLICY_DENIED', message: 'headless' } }, '@a'),
  );
  assert.deepStrictEqual(failed, {
    ok: false,
    error: { code: 'POLICY_DENIED', message: 'headless' },
    ref: '@a',
  });
  assert.deepStrictEqual(JSON.parse(actionResult({ ok: true }, '@a')), {
    ok: true,
    error: null,
    ref: '@a',
  });
});

test('pruneSnapshots: older snapshots become placeholders without mutating the input', () => {
  const history = [
    { role: 'user', content: 'task' },
    { role: 'tool', tool_call_id: '1', content: '{"tree":1}', isSnapshot: true },
    { role: 'tool', tool_call_id: '2', content: '{"ok":true}', isSnapshot: false },
  ];
  const pruned = pruneSnapshots(history);
  assert.strictEqual(pruned[1].content, STALE_SNAPSHOT_TEXT);
  assert.strictEqual(pruned[2].content, '{"ok":true}');
  assert.strictEqual(history[1].content, '{"tree":1}');
  assert.deepStrictEqual(toWireMessages(pruned)[1], {
    role: 'tool',
    tool_call_id: '1',
    content: STALE_SNAPSHOT_TEXT,
  });
});

test('tool whitelist: only snapshot/click/type/done are offered', () => {
  assert.deepStrictEqual([...ALLOWED_TOOLS], ['snapshot', 'click', 'type', 'done']);
  assert.deepStrictEqual(
    TOOL_SCHEMAS.map((t) => t.function.name),
    ['snapshot', 'click', 'type', 'done'],
  );
});

test('clampSteps: default 8, capped at 20', () => {
  assert.strictEqual(clampSteps(undefined), 8);
  assert.strictEqual(clampSteps(0), 8);
  assert.strictEqual(clampSteps(3), 3);
  assert.strictEqual(clampSteps(999), 20);
});

test('resolveAgentDesktopBin: finds ~/.local/bin when PATH is minimal', () => {
  const bin = resolveAgentDesktopBin({
    env: { PATH: '/usr/bin:/bin' },
    homedir: '/Users/x',
    exists: (p) => p === '/Users/x/.local/bin/agent-desktop',
  });
  assert.strictEqual(bin, '/Users/x/.local/bin/agent-desktop');
  assert.strictEqual(resolveAgentDesktopBin({ env: {}, homedir: '/h', exists: () => false }), null);
});

/**
 * @param {Array<{ content?: string, tool_calls?: any[] }>} replies
 */
function scriptedChat(replies) {
  /** @type {any[][]} */
  const seen = [];
  let i = 0;
  return {
    seen,
    chat: async (/** @type {any} */ req) => {
      seen.push(JSON.parse(JSON.stringify(req.messages)));
      return replies[i++] || { content: 'stuck' };
    },
  };
}

/** @param {string} name @param {object} [args] @param {string} [id] */
const call = (name, args = {}, id = name) => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) },
});

test('run: snapshot → click (ref fixed, uncertain → hint) → snapshot → done', async () => {
  /** @type {any[]} */
  const execCalls = [];
  const exec = async (/** @type {string[]} */ args, /** @type {any} */ opts = {}) => {
    execCalls.push({ args, stdin: opts.stdin });
    if (args[0] === 'snapshot') {
      return {
        ok: true,
        data: {
          ref_count: 2,
          tree: { role: 'window', children: [{ value: 'Mail', ref_id: '@s1:e2' }] },
        },
      };
    }
    return {
      ok: false,
      error: { code: 'ACTION_FAILED', message: 'mutation outcome is uncertain' },
    };
  };
  const { chat, seen } = scriptedChat([
    { tool_calls: [call('snapshot', {}, 'a')] },
    { tool_calls: [call('click', { ref: 's1:e2' }, 'b')] },
    { tool_calls: [call('snapshot', {}, 'c')] },
    { tool_calls: [call('done', { answer: 'Mail' }, 'd')] },
  ]);
  /** @type {any[]} */
  const steps = [];
  const agent = createDesktopAgent({ exec, chat });
  const result = await agent.run({
    task: 't',
    app: 'Finder',
    model: 'm',
    onStep: (s) => steps.push(s),
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.answer, 'Mail');
  assert.strictEqual(result.steps, 4);
  assert.deepStrictEqual(execCalls[1].args, ['click', '@s1:e2']);
  assert.strictEqual(steps[1].ok, 'unknown');

  // The 4th request carries only the newest snapshot; the first was replaced.
  const last = seen[3].filter((/** @type {any} */ m) => m.role === 'tool');
  assert.strictEqual(last[0].content, STALE_SNAPSHOT_TEXT);
  assert.match(last[2].content, /Mail/);
  assert.ok(seen[3].every((/** @type {any} */ m) => !('isSnapshot' in m)));
  assert.strictEqual(steps.at(-1).kind, 'end');
});

test('run: type sends text on stdin, never in argv', async () => {
  /** @type {any[]} */
  const execCalls = [];
  const exec = async (/** @type {string[]} */ args, /** @type {any} */ opts = {}) => {
    execCalls.push({ args, stdin: opts.stdin });
    return { ok: true };
  };
  const { chat } = scriptedChat([
    { tool_calls: [call('type', { ref: '@s1:e1', text: '你好 hello' })] },
    { tool_calls: [call('done', { answer: 'ok' })] },
  ]);
  await createDesktopAgent({ exec, chat }).run({ task: 't', app: 'TextEdit', model: 'm' });
  assert.deepStrictEqual(execCalls[0], {
    args: ['type', '@s1:e1', '--stdin'],
    stdin: '你好 hello',
  });
});

const NOT_APPLIED = {
  ok: false,
  error: {
    code: 'ACTION_FAILED',
    message: 'Post-action state does not match the requested change',
  },
};

test('run: type falls back to set-value (current + text, via stdin) when a web field ignores typing', async () => {
  /** @type {any[]} */
  const execCalls = [];
  const exec = async (/** @type {string[]} */ args, /** @type {any} */ opts = {}) => {
    execCalls.push({ args, stdin: opts.stdin });
    if (args[0] === 'type') return NOT_APPLIED;
    if (args[0] === 'get') return { ok: true, data: { value: 'Ada ' } };
    return { ok: true };
  };
  const { chat, seen } = scriptedChat([
    { tool_calls: [call('type', { ref: 's1:e1', text: 'Lovelace' })] },
    { tool_calls: [call('done', { answer: 'ok' })] },
  ]);
  await createDesktopAgent({ exec, chat }).run({ task: 't', app: 'Safari', model: 'm' });
  assert.deepStrictEqual(
    execCalls.map((c) => c.args),
    [
      ['type', '@s1:e1', '--stdin'],
      ['get', '@s1:e1', '--property', 'value'],
      ['set-value', '@s1:e1', '--stdin'],
    ],
  );
  assert.strictEqual(execCalls[2].stdin, 'Ada Lovelace');
  const toolReply = JSON.parse(seen[1].find((/** @type {any} */ m) => m.role === 'tool').content);
  assert.strictEqual(toolReply.ok, true);
});

test('run: type that landed despite the warning is not typed again', async () => {
  /** @type {string[]} */
  const verbs = [];
  const exec = async (/** @type {string[]} */ args) => {
    verbs.push(args[0]);
    if (args[0] === 'type') return NOT_APPLIED;
    return { ok: true, data: { value: 'Ada Lovelace' } };
  };
  const { chat, seen } = scriptedChat([
    { tool_calls: [call('type', { ref: '@s1:e1', text: 'Lovelace' })] },
    { tool_calls: [call('done', { answer: 'ok' })] },
  ]);
  await createDesktopAgent({ exec, chat }).run({ task: 't', app: 'Safari', model: 'm' });
  assert.deepStrictEqual(verbs, ['type', 'get']);
  const toolReply = JSON.parse(seen[1].find((/** @type {any} */ m) => m.role === 'tool').content);
  assert.strictEqual(toolReply.ok, true);
});

test('run: physical typing is the last resort and only when the run allows it', async () => {
  for (const headed of [false, true]) {
    /** @type {string[][]} */
    const calls = [];
    const exec = async (/** @type {string[]} */ args) => {
      calls.push(args);
      if (args[0] === 'get') return { ok: true, data: { value: '' } };
      return args.includes('--headed') ? { ok: true } : NOT_APPLIED;
    };
    const { chat, seen } = scriptedChat([
      { tool_calls: [call('type', { ref: '@s1:e1', text: 'hi' })] },
      { tool_calls: [call('done', { answer: 'ok' })] },
    ]);
    await createDesktopAgent({ exec, chat }).run({
      task: 't',
      app: 'Safari',
      model: 'm',
      headed,
    });
    assert.strictEqual(
      calls.some((c) => c.includes('--headed')),
      headed,
      `headed=${headed}`,
    );
    const reply = JSON.parse(seen[1].find((/** @type {any} */ m) => m.role === 'tool').content);
    assert.strictEqual(reply.ok, headed);
  }
});

test('run: type reports the original failure when the set-value fallback also fails', async () => {
  const exec = async (/** @type {string[]} */ args) => {
    if (args[0] === 'type') return NOT_APPLIED;
    if (args[0] === 'get') return { ok: true, data: { value: null } };
    return { ok: false, error: { code: 'ACTION_FAILED', message: 'read-only field' } };
  };
  const { chat, seen } = scriptedChat([
    { tool_calls: [call('type', { ref: '@s1:e1', text: 'x' })] },
    { tool_calls: [call('done', { answer: 'ok' })] },
  ]);
  await createDesktopAgent({ exec, chat }).run({ task: 't', app: 'Safari', model: 'm' });
  const toolReply = JSON.parse(seen[1].find((/** @type {any} */ m) => m.role === 'tool').content);
  assert.strictEqual(toolReply.ok, false);
  assert.strictEqual(toolReply.error.code, 'ACTION_FAILED');
});

test('run: other type failures do not trigger the fallback', async () => {
  /** @type {string[]} */
  const verbs = [];
  const exec = async (/** @type {string[]} */ args) => {
    verbs.push(args[0]);
    return { ok: false, error: { code: 'POLICY_DENIED', message: 'headless' } };
  };
  const { chat } = scriptedChat([
    { tool_calls: [call('type', { ref: '@s1:e1', text: 'x' })] },
    { tool_calls: [call('done', { answer: 'ok' })] },
  ]);
  await createDesktopAgent({ exec, chat }).run({ task: 't', app: 'TextEdit', model: 'm' });
  assert.deepStrictEqual(verbs, ['type']);
});

test('run: tools outside the whitelist are refused without touching the desktop', async () => {
  /** @type {string[][]} */
  const execCalls = [];
  const exec = async (/** @type {string[]} */ args) => {
    execCalls.push(args);
    return { ok: true };
  };
  const { chat, seen } = scriptedChat([
    { tool_calls: [call('press', { combo: 'cmd+q' }), call('close-app', { app: 'Finder' })] },
    { tool_calls: [call('done', { answer: 'x' })] },
  ]);
  await createDesktopAgent({ exec, chat }).run({ task: 't', app: 'Finder', model: 'm' });
  assert.deepStrictEqual(execCalls, []);
  const toolMsgs = seen[1].filter((/** @type {any} */ m) => m.role === 'tool');
  assert.match(toolMsgs[0].content, /not allowed/);
});

test('run: stops at the step limit and when aborted', async () => {
  const exec = async () => ({ ok: true, data: { tree: { role: 'w' } } });
  const loop = { chat: async () => ({ tool_calls: [call('snapshot')] }) };
  const capped = await createDesktopAgent({ exec, chat: loop.chat }).run({
    task: 't',
    app: 'Finder',
    model: 'm',
    maxSteps: 3,
  });
  assert.deepStrictEqual([capped.ok, capped.reason, capped.steps], [false, 'max_steps', 3]);

  const controller = new AbortController();
  const aborting = async () => {
    controller.abort();
    return { tool_calls: [call('snapshot')] };
  };
  const stopped = await createDesktopAgent({ exec, chat: aborting }).run({
    task: 't',
    app: 'Finder',
    model: 'm',
    signal: controller.signal,
  });
  assert.strictEqual(stopped.reason, 'aborted');
});

test('run: multiple windows → retries the snapshot with --window-id', async () => {
  /** @type {string[][]} */
  const execCalls = [];
  const exec = async (/** @type {string[]} */ args) => {
    execCalls.push(args);
    if (args[0] === 'list-windows') {
      return {
        ok: true,
        data: [
          { id: 'w-1', visible: true },
          { id: 'w-2', is_focused: true },
        ],
      };
    }
    if (args.includes('--window-id')) return { ok: true, data: { tree: { role: 'window' } } };
    return { ok: false, error: { code: 'AMBIGUOUS_TARGET', message: '2 windows' } };
  };
  const { chat } = scriptedChat([
    { tool_calls: [call('snapshot')] },
    { tool_calls: [call('done', { answer: 'ok' })] },
  ]);
  await createDesktopAgent({ exec, chat }).run({ task: 't', app: 'TextEdit', model: 'm' });
  assert.deepStrictEqual(execCalls.at(-1), ['snapshot', '--app', 'TextEdit', '--window-id', 'w-2']);
});

/**
 * A fake agent-desktop with two TextEdit windows.
 * @param {string[][]} execCalls
 */
function twoWindowExec(execCalls) {
  const windows = [
    { id: 'w-1', title: 'Notes.txt', visible: true, is_focused: true },
    { id: 'w-2', title: 'Budget 2026', visible: true },
  ];
  return async (/** @type {string[]} */ args) => {
    execCalls.push(args);
    if (args[0] === 'list-windows') return { ok: true, data: windows };
    const id = args[args.indexOf('--window-id') + 1];
    if (id === 'w-gone') {
      return { ok: false, error: { code: 'WINDOW_NOT_FOUND', message: 'closed' } };
    }
    return { ok: true, data: { tree: { role: 'window', name: id || 'ambiguous' } } };
  };
}

test('run: windowTitle picks the matching window and every later snapshot stays on it', async () => {
  /** @type {string[][]} */
  const execCalls = [];
  const { chat } = scriptedChat([
    { tool_calls: [call('snapshot')] },
    { tool_calls: [call('snapshot')] },
    { tool_calls: [call('done', { answer: 'ok' })] },
  ]);
  const r = await createDesktopAgent({ exec: twoWindowExec(execCalls), chat }).run({
    task: 't',
    app: 'TextEdit',
    model: 'm',
    windowTitle: 'budget',
  });
  assert.strictEqual(r.ok, true);
  const snapshots = execCalls.filter((a) => a[0] === 'snapshot');
  assert.deepStrictEqual(snapshots, [
    ['snapshot', '--app', 'TextEdit', '--window-id', 'w-2'],
    ['snapshot', '--app', 'TextEdit', '--window-id', 'w-2'],
  ]);
  assert.strictEqual(execCalls.filter((a) => a[0] === 'list-windows').length, 1);
});

test('run: no window with that title ends the run instead of using another window', async () => {
  /** @type {string[][]} */
  const execCalls = [];
  const { chat } = scriptedChat([{ tool_calls: [call('snapshot')] }]);
  const r = await createDesktopAgent({ exec: twoWindowExec(execCalls), chat }).run({
    task: 't',
    app: 'TextEdit',
    model: 'm',
    windowTitle: 'Nope',
  });
  assert.deepStrictEqual([r.ok, r.reason], [false, 'desktop_error']);
  assert.match(String(r.error), /Nope/);
  assert.ok(!execCalls.some((a) => a[0] === 'snapshot'), 'never snapshots a different window');
});

test('run: window titles hidden by macOS ends the run with a Screen Recording hint', async () => {
  /** @type {string[][]} */
  const execCalls = [];
  const { chat } = scriptedChat([{ tool_calls: [call('snapshot')] }]);
  // Without Screen Recording, CoreGraphics returns windows with empty titles.
  const exec = async (/** @type {string[]} */ args) => {
    execCalls.push(args);
    if (args[0] === 'list-windows') {
      return {
        ok: true,
        data: [
          { id: 'w-1', visible: true, title: '' },
          { id: 'w-2', title: '' },
        ],
      };
    }
    return { ok: true, data: { tree: { role: 'window' } } };
  };
  const r = await createDesktopAgent({ exec, chat }).run({
    task: 't',
    app: 'Finder',
    model: 'm',
    windowTitle: '下載',
  });
  assert.deepStrictEqual([r.ok, r.reason], [false, 'desktop_error']);
  assert.match(String(r.error), /^SCREEN_RECORDING_REQUIRED: .*Screen Recording/);
  assert.ok(!execCalls.some((a) => a[0] === 'snapshot'), 'never snapshots an unverified window');
});

test('run: a failed window listing reports its own error, not a missing window', async () => {
  const { chat } = scriptedChat([{ tool_calls: [call('snapshot')] }]);
  const exec = async (/** @type {string[]} */ args) =>
    args[0] === 'list-windows'
      ? { ok: false, error: { code: 'PERM_DENIED', message: 'no accessibility' } }
      : { ok: true, data: { tree: { role: 'window' } } };
  const r = await createDesktopAgent({ exec, chat }).run({
    task: 't',
    app: 'Finder',
    model: 'm',
    windowTitle: '下載',
  });
  assert.deepStrictEqual([r.ok, r.reason], [false, 'desktop_error']);
  assert.match(String(r.error), /^PERM_DENIED: .*Accessibility/);
});

test('run: an ambiguous app keeps the window it chose for the following snapshots', async () => {
  /** @type {string[][]} */
  const execCalls = [];
  const { chat } = scriptedChat([
    { tool_calls: [call('snapshot')] },
    { tool_calls: [call('snapshot')] },
    { tool_calls: [call('done', { answer: 'ok' })] },
  ]);
  const exec = async (/** @type {string[]} */ args) => {
    execCalls.push(args);
    if (args[0] === 'list-windows') {
      return { ok: true, data: [{ id: 'w-9', visible: true, is_focused: true }] };
    }
    if (args.includes('--window-id')) return { ok: true, data: { tree: { role: 'window' } } };
    return { ok: false, error: { code: 'AMBIGUOUS_TARGET', message: '2 windows' } };
  };
  await createDesktopAgent({ exec, chat }).run({ task: 't', app: 'TextEdit', model: 'm' });
  assert.deepStrictEqual(execCalls.at(-1), ['snapshot', '--app', 'TextEdit', '--window-id', 'w-9']);
  assert.strictEqual(execCalls.filter((a) => a[0] === 'list-windows').length, 1);
});

test('run: a closed window is chosen again by title', async () => {
  /** @type {string[][]} */
  const execCalls = [];
  const base = twoWindowExec(execCalls);
  let snapshots = 0;
  const exec = async (/** @type {string[]} */ args) => {
    if (args[0] === 'snapshot' && ++snapshots === 2) {
      // The window cached by the first snapshot disappears before the second one.
      execCalls.push(args);
      return { ok: false, error: { code: 'WINDOW_NOT_FOUND', message: 'closed' } };
    }
    return base(args);
  };
  const { chat } = scriptedChat([
    { tool_calls: [call('snapshot')] },
    { tool_calls: [call('snapshot')] },
    { tool_calls: [call('done', { answer: 'ok' })] },
  ]);
  await createDesktopAgent({ exec, chat }).run({
    task: 't',
    app: 'TextEdit',
    model: 'm',
    windowTitle: 'Budget',
  });
  assert.strictEqual(execCalls.filter((a) => a[0] === 'list-windows').length, 2);
  assert.deepStrictEqual(execCalls.at(-1), ['snapshot', '--app', 'TextEdit', '--window-id', 'w-2']);
});

test('run: a model error ends the run with the message', async () => {
  const exec = async () => ({ ok: true });
  const chat = async () => {
    throw new Error('HTTP 500');
  };
  const r = await createDesktopAgent({ exec, chat }).run({ task: 't', app: 'Finder', model: 'm' });
  assert.deepStrictEqual([r.ok, r.reason, r.error], [false, 'model_error', 'HTTP 500']);
});

test('validateRunOptions: requires a task and an app name, keeps the model server local', () => {
  const { validateRunOptions } = require('../desktop-agent-ipc.js');
  assert.deepStrictEqual(validateRunOptions({ task: ' list apps ', app: 'Finder' }), {
    task: 'list apps',
    app: 'Finder',
    windowTitle: '',
    headed: false,
    host: '127.0.0.1',
    port: 1234,
    model: '',
    maxSteps: 8,
  });
  assert.strictEqual(
    /** @type {any} */ (validateRunOptions({ task: 'x', app: 'Finder', windowTitle: ' 報表 ' }))
      .windowTitle,
    '報表',
  );
  assert.ok(
    'error' in validateRunOptions({ task: 'x', app: 'Finder', windowTitle: 'w'.repeat(101) }),
  );
  assert.ok('error' in validateRunOptions({ task: '', app: 'Finder' }));
  assert.ok('error' in validateRunOptions({ task: 'x', app: 'Finder; rm -rf ~' }));
  assert.ok('error' in validateRunOptions({ task: 'x', app: 'Finder', host: '10.0.0.5' }));
});

test('run: a snapshot error the model cannot fix ends the run at once', async () => {
  let snapshots = 0;
  const exec = async () => {
    snapshots++;
    return { ok: false, error: { code: 'WINDOW_NOT_FOUND', message: 'no matching window' } };
  };
  const loop = async () => ({ tool_calls: [call('snapshot')] });
  const r = await createDesktopAgent({ exec, chat: loop }).run({
    task: 't',
    app: 'Finder',
    model: 'm',
  });
  assert.deepStrictEqual([r.ok, r.reason, r.steps, snapshots], [false, 'desktop_error', 1, 1]);
  assert.match(r.error || '', /^WINDOW_NOT_FOUND: .*open one first/);
});
