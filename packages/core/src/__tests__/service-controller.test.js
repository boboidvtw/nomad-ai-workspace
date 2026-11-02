const test = require('node:test');
const assert = require('node:assert');
const { ServiceController } = require('../services/service-controller');
const { handleServiceRequest } = require('../services/service-routes');
const { buildServiceRegistry } = require('../services/service-registry');

const PORT_SERVICE = {
  id: 'alpha',
  label: 'Alpha',
  check: { type: 'port', port: 9001 },
  start: { kind: 'exec', bin: 'alpha-start', args: ['--up'] },
  stop: { kind: 'exec', bin: 'alpha-stop', args: [] },
  timeoutMs: 40,
};
const PROCESS_SERVICE = {
  id: 'beta',
  label: 'Beta',
  check: { type: 'port', port: 9002 },
  start: { kind: 'daemon', bin: 'beta', args: ['main.py'], logName: 'beta' },
  stop: { kind: 'process', port: 9002, marker: 'main.py' },
  timeoutMs: 40,
};
const DOCKER_SERVICE = { ...PORT_SERVICE, id: 'gamma', needsDocker: true };
const MISSING_SERVICE = {
  ...PORT_SERVICE,
  id: 'delta',
  requires: { paths: ['/nope'], reason: '路徑已不存在' },
};
const TERMINAL_SERVICE = {
  id: 'cli',
  label: 'CLI',
  start: { kind: 'terminal', command: 'cli-tool' },
  stop: null,
  noStopReason: '請在終端機結束',
};

function createRunner(overrides = {}) {
  const calls = [];
  const ports = new Set();
  const runner = {
    calls,
    ports,
    pathExists: () => true,
    which: (bin) => '/bin/' + bin,
    probePort: async (port) => ports.has(port),
    findPids: async () => [],
    pidsOnPort: async () => [],
    commandLine: async () => '',
    logHint: (name) => '~/.nomad/service-logs/' + name + '.log',
    kill: (pid, signal) => calls.push(['kill', pid, signal]),
    writeLauncher: (name, command) => {
      calls.push(['launcher', name, command]);
      return '/state/' + name + '.command';
    },
    spawnDetached: (bin, args) => {
      calls.push(['spawn', bin, args]);
      return 4242;
    },
    exec: async (bin, args) => {
      calls.push(['exec', bin, args]);
      return { code: 0 };
    },
    ...overrides,
  };
  return runner;
}

function createController(services, runner) {
  return new ServiceController({ services, runner, pollMs: 1 });
}

test('list: reports running, stopped and unavailable from real checks', async () => {
  const runner = createRunner({ pathExists: (p) => p !== '/nope' });
  runner.ports.add(9001);
  const ctl = createController([PORT_SERVICE, PROCESS_SERVICE, MISSING_SERVICE], runner);
  const res = await ctl.list();
  const byId = Object.fromEntries(res.data.services.map((s) => [s.id, s]));
  assert.strictEqual(byId.alpha.state, 'running');
  assert.strictEqual(byId.alpha.canStop, true);
  assert.strictEqual(byId.alpha.canStart, false);
  assert.strictEqual(byId.beta.state, 'stopped');
  assert.strictEqual(byId.beta.canStart, true);
  assert.strictEqual(byId.delta.state, 'unavailable');
  assert.strictEqual(byId.delta.message, '路徑已不存在');
  assert.strictEqual(byId.delta.canStart, false);
});

test('list: a missing binary is reported as unavailable', async () => {
  const runner = createRunner({ which: () => null });
  const ctl = createController([PORT_SERVICE], runner);
  const res = await ctl.list();
  assert.strictEqual(res.data.services[0].state, 'unavailable');
  assert.ok(res.data.services[0].message.includes('alpha-start'));
});

test('start: runs the registered command and ends running once the check passes', async () => {
  const runner = createRunner({
    exec: async (bin, args) => {
      runner.calls.push(['exec', bin, args]);
      runner.ports.add(9001);
      return { code: 0 };
    },
  });
  const ctl = createController([PORT_SERVICE], runner);
  const res = await ctl.start('alpha');
  assert.strictEqual(res.data.state, 'starting');
  await ctl.whenIdle('alpha');
  assert.deepStrictEqual(runner.calls, [['exec', '/bin/alpha-start', ['--up']]]);
  assert.strictEqual((await ctl.list()).data.services[0].state, 'running');
});

test('start: already running does nothing', async () => {
  const runner = createRunner();
  runner.ports.add(9001);
  const ctl = createController([PORT_SERVICE], runner);
  const res = await ctl.start('alpha');
  assert.strictEqual(res.data.state, 'running');
  assert.deepStrictEqual(runner.calls, []);
});

test('start: a second request during a transition is refused', async () => {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const runner = createRunner({
    exec: async () => {
      await gate;
      runner.ports.add(9001);
      return { code: 0 };
    },
  });
  const ctl = createController([PORT_SERVICE], runner);
  await ctl.start('alpha');
  const second = await ctl.start('alpha');
  assert.strictEqual(second.success, false);
  assert.strictEqual(second.errorCode, 'SERVICE_BUSY_003');
  const state = (await ctl.list()).data.services[0];
  assert.strictEqual(state.state, 'starting');
  assert.strictEqual(state.canStop, false);
  release();
  await ctl.whenIdle('alpha');
});

test('start: two simultaneous clicks run the command once', async () => {
  const runner = createRunner({
    exec: async (bin, args) => {
      runner.calls.push(['exec', bin, args]);
      runner.ports.add(9001);
      return { code: 0 };
    },
  });
  const ctl = createController([PORT_SERVICE], runner);
  const [first, second] = await Promise.all([ctl.start('alpha'), ctl.start('alpha')]);
  assert.deepStrictEqual([first.success, second.success], [true, false]);
  await ctl.whenIdle('alpha');
  assert.strictEqual(runner.calls.length, 1);
});

test('start: failures surface as failed, with a friendly message and no raw output', async () => {
  const runner = createRunner({ exec: async () => ({ code: 1, output: 'password=hunter2' }) });
  const ctl = createController([PORT_SERVICE], runner);
  await ctl.start('alpha');
  await ctl.whenIdle('alpha');
  const state = (await ctl.list()).data.services[0];
  assert.strictEqual(state.state, 'failed');
  assert.ok(!state.message.includes('hunter2'));
  assert.strictEqual(state.canStart, true);
});

test('start: reports failed when the service never comes up', async () => {
  const ctl = createController([PORT_SERVICE], createRunner());
  await ctl.start('alpha');
  await ctl.whenIdle('alpha');
  const state = (await ctl.list()).data.services[0];
  assert.strictEqual(state.state, 'failed');
  assert.ok(state.message.includes('逾時'));
});

test('start: docker services bring the engine up first', async () => {
  const runner = createRunner({
    exec: async (bin, args) => {
      runner.calls.push([bin, args]);
      if (bin.endsWith('alpha-start')) runner.ports.add(9001);
      return { code: 0 };
    },
  });
  const ctl = createController([DOCKER_SERVICE], runner);
  await ctl.start('gamma');
  await ctl.whenIdle('gamma');
  assert.deepStrictEqual(runner.calls[0], ['/bin/orb', ['start']]);
  assert.strictEqual(runner.calls[1][0], '/bin/alpha-start');
});

test('start: daemon services are spawned detached', async () => {
  const runner = createRunner({
    spawnDetached: (bin, args) => {
      runner.calls.push(['spawn', bin, args]);
      runner.ports.add(9002);
      return 4242;
    },
  });
  const ctl = createController([PROCESS_SERVICE], runner);
  await ctl.start('beta');
  await ctl.whenIdle('beta');
  assert.deepStrictEqual(runner.calls, [['spawn', '/bin/beta', ['main.py']]]);
});

test('start: terminal entries open a launcher and stay ready, with no stop', async () => {
  const runner = createRunner();
  const ctl = createController([TERMINAL_SERVICE], runner);
  const before = (await ctl.list()).data.services[0];
  assert.strictEqual(before.state, 'ready');
  assert.strictEqual(before.canStop, false);
  assert.strictEqual(before.message, '請在終端機結束');
  await ctl.start('cli');
  await ctl.whenIdle('cli');
  assert.deepStrictEqual(runner.calls[0], ['launcher', 'cli', 'cli-tool']);
  assert.deepStrictEqual(runner.calls[1], [
    'exec',
    '/usr/bin/open',
    ['-a', 'Terminal', '/state/cli.command'],
  ]);
  assert.strictEqual((await ctl.stop('cli')).success, false);
});

test('stop: kills only the process whose command line matches', async () => {
  const runner = createRunner({
    pidsOnPort: async () => [111],
    commandLine: async () => '/venv/bin/python main.py --port 9002',
    kill: (pid, signal) => {
      runner.calls.push(['kill', pid, signal]);
      runner.ports.delete(9002);
    },
  });
  runner.ports.add(9002);
  const ctl = createController([PROCESS_SERVICE], runner);
  await ctl.stop('beta');
  await ctl.whenIdle('beta');
  assert.deepStrictEqual(runner.calls, [['kill', 111, 'SIGTERM']]);
  assert.strictEqual((await ctl.list()).data.services[0].state, 'stopped');
});

test('stop: refuses to kill an unrelated program on the same port', async () => {
  const runner = createRunner({
    pidsOnPort: async () => [222],
    commandLine: async () => '/usr/bin/some-other-server',
  });
  runner.ports.add(9002);
  const ctl = createController([PROCESS_SERVICE], runner);
  await ctl.stop('beta');
  await ctl.whenIdle('beta');
  assert.deepStrictEqual(runner.calls, []);
  const state = (await ctl.list()).data.services[0];
  assert.strictEqual(state.state, 'failed');
  assert.ok(state.message.includes('不是'));
});

test('stop: a process that ignores SIGTERM is killed after its marker is checked again', async () => {
  const runner = createRunner({
    pidsOnPort: async () => (runner.ports.has(9002) ? [111] : []),
    commandLine: async () => '/venv/bin/python main.py --port 9002',
    kill: (pid, signal) => {
      runner.calls.push(['kill', pid, signal]);
      if (signal === 'SIGKILL') runner.ports.delete(9002);
    },
  });
  runner.ports.add(9002);
  const ctl = createController([PROCESS_SERVICE], runner);
  await ctl.stop('beta');
  await ctl.whenIdle('beta');
  assert.deepStrictEqual(runner.calls, [
    ['kill', 111, 'SIGTERM'],
    ['kill', 111, 'SIGKILL'],
  ]);
  assert.strictEqual((await ctl.list()).data.services[0].state, 'stopped');
});

test('stop: no SIGKILL when the port now belongs to another program', async () => {
  let checks = 0;
  const runner = createRunner({
    pidsOnPort: async () => [111],
    commandLine: async () => (checks++ === 0 ? 'python main.py' : '/usr/bin/other-server'),
  });
  runner.ports.add(9002);
  const ctl = createController([PROCESS_SERVICE], runner);
  await ctl.stop('beta');
  await ctl.whenIdle('beta');
  assert.deepStrictEqual(runner.calls, [['kill', 111, 'SIGTERM']]);
  assert.strictEqual((await ctl.list()).data.services[0].state, 'failed');
});

test('start: a docker start that fails once is retried after the engine is up again', async () => {
  let attempts = 0;
  const runner = createRunner({
    exec: async (bin, args) => {
      runner.calls.push([bin, args]);
      if (!bin.endsWith('alpha-start')) return { code: 0 };
      attempts += 1;
      if (attempts === 1) return { code: 1 };
      runner.ports.add(9001);
      return { code: 0 };
    },
  });
  const ctl = createController([DOCKER_SERVICE], runner);
  await ctl.start('gamma');
  await ctl.whenIdle('gamma');
  assert.deepStrictEqual(
    runner.calls.map((call) => call[0]),
    ['/bin/orb', '/bin/alpha-start', '/bin/orb', '/bin/alpha-start'],
  );
  assert.strictEqual((await ctl.list()).data.services[0].state, 'running');
});

test('start: a docker start that fails twice reports failed with a retry hint', async () => {
  const runner = createRunner({
    exec: async (bin, args) => {
      runner.calls.push([bin, args]);
      return { code: bin.endsWith('alpha-start') ? 1 : 0 };
    },
  });
  const ctl = createController([DOCKER_SERVICE], runner);
  await ctl.start('gamma');
  await ctl.whenIdle('gamma');
  const state = (await ctl.list()).data.services[0];
  assert.strictEqual(state.state, 'failed');
  assert.ok(state.message.includes('再試'));
  assert.strictEqual(runner.calls.filter((call) => call[0].endsWith('alpha-start')).length, 2);
});

test('stop: already stopped does nothing', async () => {
  const runner = createRunner();
  const ctl = createController([PORT_SERVICE], runner);
  assert.strictEqual((await ctl.stop('alpha')).data.state, 'stopped');
  assert.deepStrictEqual(runner.calls, []);
});

test('unknown ids are rejected before anything runs', async () => {
  const runner = createRunner();
  const ctl = createController([PORT_SERVICE], runner);
  assert.strictEqual((await ctl.start('rm -rf /')).errorCode, 'SERVICE_NOT_FOUND_001');
  assert.strictEqual((await ctl.stop('__proto__')).errorCode, 'SERVICE_NOT_FOUND_001');
  assert.deepStrictEqual(runner.calls, []);
});

test('routes: only the id in the path selects an action', async () => {
  const runner = createRunner();
  const ctl = createController([PORT_SERVICE], runner);
  const res = await handleServiceRequest(ctl, 'POST', '/api/services/alpha/start');
  assert.strictEqual(res.status, 202);
  assert.strictEqual(res.body.data.state, 'starting');
  await ctl.whenIdle('alpha');
  assert.strictEqual(handleServiceRequest.length, 3, 'request bodies are never read');
  assert.deepStrictEqual(runner.calls[0], ['exec', '/bin/alpha-start', ['--up']]);
});

test('routes: list, unknown id, bad action and unrelated paths', async () => {
  const ctl = createController([PORT_SERVICE], createRunner());
  assert.strictEqual((await handleServiceRequest(ctl, 'GET', '/api/services')).status, 200);
  assert.strictEqual(
    (await handleServiceRequest(ctl, 'POST', '/api/services/x/start')).status,
    404,
  );
  assert.strictEqual(await handleServiceRequest(ctl, 'POST', '/api/services/alpha/exec'), null);
  assert.strictEqual(await handleServiceRequest(ctl, 'GET', '/api/services/alpha/start'), null);
  assert.strictEqual(await handleServiceRequest(ctl, 'GET', '/api/status'), null);
});

test('registry: every action is argv-based and destructive compose flags never appear', () => {
  const services = buildServiceRegistry('/home/u');
  const ids = services.map((s) => s.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const service of services) {
    for (const action of [service.start, service.stop]) {
      if (!action || !action.args) continue;
      assert.ok(!action.args.includes('-v'), service.id);
      assert.ok(!action.args.includes('--volumes'), service.id);
      assert.ok(!['sh', 'bash', 'zsh'].includes(action.bin), service.id);
    }
  }
});

test('registry: stops that would end other work are not offered', () => {
  const byId = Object.fromEntries(buildServiceRegistry('/home/u').map((s) => [s.id, s]));
  assert.strictEqual(byId['claude-cli'].stop, null);
  assert.strictEqual(byId['codex-cli'].stop, null);
  assert.ok(byId['nomad-studio'].confirmStop);
  assert.ok(byId['hermes-gateway'].confirmStart);
});

test('registry: the Hermes gateway is found however hermes launches it', () => {
  const hermes = buildServiceRegistry('/home/u').find((s) => s.id === 'hermes-gateway');
  // pgrep matches with POSIX regular expressions, where `.` also matches a newline: dotAll.
  const check = new RegExp(/** @type {any} */ (hermes).check.pattern, 's');
  const stop = /** @type {any} */ (hermes).stop;
  // hermes 2026-11 runs its CLI through `python3 -I -c <launcher>` (seen live), so the command
  // line no longer holds "hermes gateway run".
  const launcher =
    '/Users/u/.hermes/tools/python-3.14.9/bin/python3 -I -c import os, re, sys\n' +
    'from hermes_cli.main import main\nsys.exit(main())\n gateway run';
  for (const cmd of [launcher, '/usr/local/bin/python3 /Users/u/.local/bin/hermes gateway run']) {
    assert.match(cmd, check);
    assert.match(cmd, new RegExp(stop.pattern, 's'));
    assert.ok(cmd.includes(stop.marker));
  }
  assert.doesNotMatch('zsh -c "hermes gateway run; tail -f log"', check);
});
