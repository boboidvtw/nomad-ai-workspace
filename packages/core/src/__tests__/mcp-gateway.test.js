const { test } = require('node:test');
const assert = require('node:assert');
const { McpGateway, isOk, isErr, ErrorCodes } = require('../../index');

test('McpGateway: lists default tools and executes read_file safely', async () => {
  const gateway = new McpGateway();

  const toolsRes = gateway.listTools();
  assert.strictEqual(isOk(toolsRes), true);
  const toolNames = toolsRes.data.map((t) => t.name);
  assert.ok(toolNames.includes('read_file'));
  assert.ok(toolNames.includes('list_directory'));

  // Test callTool on existing package.json
  const pkgPath = require('path').resolve(__dirname, '../../package.json');
  const callRes = await gateway.callTool('read_file', { path: pkgPath });
  assert.strictEqual(isOk(callRes), true);
  assert.ok(callRes.data.content.includes('@nomad/core'));

  // Test callTool on missing file
  const missingRes = await gateway.callTool('read_file', { path: '/invalid/file/path/xyz' });
  assert.strictEqual(isErr(missingRes), true);
  assert.strictEqual(missingRes.errorCode, ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002);
});

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { defaultAllowedPaths, defaultDeniedPaths } = require('../mcp/mcp-gateway');

/** Builds <tmp>/{root/inside.txt, outside/secret.txt, home/.ssh/id_rsa}. */
function makeSandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-mcp-'));
  const root = path.join(base, 'root');
  const outside = path.join(base, 'outside');
  const home = path.join(base, 'home');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(home, '.ssh'), { recursive: true });
  fs.writeFileSync(path.join(root, 'inside.txt'), 'inside');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
  fs.writeFileSync(path.join(home, '.ssh', 'id_rsa'), 'PRIVATE KEY');
  return {
    base,
    root,
    outside,
    home,
    cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
  };
}

test('McpGateway: reads and lists inside an allowed root', async (t) => {
  const box = makeSandbox();
  t.after(box.cleanup);
  const gateway = new McpGateway({ allowedPaths: [box.root] });

  const readRes = await gateway.callTool('read_file', { path: path.join(box.root, 'inside.txt') });
  assert.strictEqual(isOk(readRes), true);
  assert.strictEqual(readRes.data.content, 'inside');

  const listRes = await gateway.callTool('list_directory', { path: box.root });
  assert.strictEqual(isOk(listRes), true);
  assert.deepStrictEqual(
    listRes.data.items.map((i) => i.name),
    ['inside.txt'],
  );
});

test('McpGateway: rejects paths outside allowed roots', async (t) => {
  const box = makeSandbox();
  t.after(box.cleanup);
  const gateway = new McpGateway({ allowedPaths: [box.root] });

  for (const [tool, target] of [
    ['read_file', path.join(box.outside, 'secret.txt')],
    ['list_directory', box.outside],
    ['read_file', '/etc/hosts'],
    // a sibling sharing the root's name prefix must not count as inside it
    ['list_directory', box.root + '-evil'],
  ]) {
    const res = await gateway.callTool(tool, { path: target });
    assert.strictEqual(isErr(res), true, `${tool} ${target}`);
    assert.strictEqual(res.errorCode, ErrorCodes.MCP_TOOL_EXECUTION_FAILED_002);
    assert.match(res.message, /outside allowed roots/);
  }
});

test('McpGateway: rejects `..` traversal out of a root', async (t) => {
  const box = makeSandbox();
  t.after(box.cleanup);
  const gateway = new McpGateway({ allowedPaths: [box.root] });

  const readRes = await gateway.callTool('read_file', {
    path: path.join(box.root, '..', 'outside', 'secret.txt'),
  });
  assert.strictEqual(isErr(readRes), true);
  assert.match(readRes.message, /outside allowed roots/);

  const listRes = await gateway.callTool('list_directory', { path: `${box.root}/../outside` });
  assert.strictEqual(isErr(listRes), true);
  assert.match(listRes.message, /outside allowed roots/);
});

test('McpGateway: rejects symlinks that escape a root', async (t) => {
  const box = makeSandbox();
  t.after(box.cleanup);
  fs.symlinkSync(path.join(box.outside, 'secret.txt'), path.join(box.root, 'link.txt'));
  fs.symlinkSync(box.outside, path.join(box.root, 'linkdir'));
  const gateway = new McpGateway({ allowedPaths: [box.root] });

  for (const [tool, target] of [
    ['read_file', path.join(box.root, 'link.txt')],
    ['list_directory', path.join(box.root, 'linkdir')],
    ['read_file', path.join(box.root, 'linkdir', 'secret.txt')],
    // non-existent leaf under an escaping symlinked directory
    ['read_file', path.join(box.root, 'linkdir', 'missing.txt')],
  ]) {
    const res = await gateway.callTool(tool, { path: target });
    assert.strictEqual(isErr(res), true, `${tool} ${target}`);
    assert.match(res.message, /outside allowed roots/);
  }
});

test('McpGateway: denies sensitive directories even inside an allowed root', async (t) => {
  const box = makeSandbox();
  t.after(box.cleanup);
  const gateway = new McpGateway({
    allowedPaths: [box.home],
    deniedPaths: defaultDeniedPaths(box.home),
  });

  for (const [tool, target] of [
    ['read_file', path.join(box.home, '.ssh', 'id_rsa')],
    ['list_directory', path.join(box.home, '.ssh')],
    ['read_file', path.join(box.home, '.nomad', 'daemon-token')],
    ['list_directory', path.join(box.home, '.aws')],
  ]) {
    const res = await gateway.callTool(tool, { path: target });
    assert.strictEqual(isErr(res), true, `${tool} ${target}`);
    assert.match(res.message, /sensitive path denied/);
  }

  // a symlink inside the root pointing at a denied dir is denied too
  fs.symlinkSync(path.join(box.home, '.ssh'), path.join(box.home, 'keys'));
  const viaLink = await gateway.callTool('read_file', {
    path: path.join(box.home, 'keys', 'id_rsa'),
  });
  assert.match(viaLink.message, /sensitive path denied/);

  // the rest of the root stays readable
  assert.strictEqual(isOk(await gateway.callTool('list_directory', { path: box.home })), true);
});

test('McpGateway: default deny list covers the real home directory', async () => {
  const gateway = new McpGateway({ allowedPaths: [os.homedir()] });
  const res = await gateway.callTool('read_file', {
    path: path.join(os.homedir(), '.nomad', 'daemon-token'),
  });
  assert.strictEqual(isErr(res), true);
  assert.match(res.message, /sensitive path denied/);
});

test('McpGateway: default roots come from NOMAD_MCP_ALLOWED_PATHS, else cwd only', () => {
  const a = path.resolve('/tmp/a');
  const b = path.resolve('/tmp/b');
  assert.deepStrictEqual(
    defaultAllowedPaths({ NOMAD_MCP_ALLOWED_PATHS: `${a}${path.delimiter} ${b} ` }),
    [a, b],
  );
  const cwd = path.resolve(process.cwd());
  assert.deepStrictEqual(defaultAllowedPaths({}), cwd === path.parse(cwd).root ? [] : [cwd]);
  assert.ok(!defaultAllowedPaths({}).includes(os.homedir()) || process.cwd() === os.homedir());
});

test('McpGateway: relative paths resolve against the first allowed root; fallback roots apply without env', async (t) => {
  const box = makeSandbox();
  t.after(box.cleanup);
  const gateway = new McpGateway({ allowedPaths: [box.root] });
  const res = await gateway.callTool('read_file', { path: 'inside.txt' });
  assert.strictEqual(isOk(res), true);
  assert.strictEqual(res.data.content, 'inside');
  assert.strictEqual(
    isErr(await gateway.callTool('read_file', { path: '../outside/secret.txt' })),
    true,
  );

  assert.deepStrictEqual(defaultAllowedPaths({}, [box.root]), [box.root]);
  assert.deepStrictEqual(
    defaultAllowedPaths({ NOMAD_MCP_ALLOWED_PATHS: box.outside }, [box.root]),
    [box.outside],
  );
});
