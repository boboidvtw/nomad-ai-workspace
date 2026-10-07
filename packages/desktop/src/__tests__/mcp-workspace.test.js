const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { McpGateway } = require('@nomad/core');
const { resolveMcpAllowedPaths } = require('../mcp-workspace.js');

test('MCP workspace: packaged app gets userData/workspace, created on demand', async (t) => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-userdata-'));
  t.after(() => fs.rmSync(userDataDir, { recursive: true, force: true }));

  const roots = resolveMcpAllowedPaths({ isPackaged: true, userDataDir, env: {} });
  const workspaceDir = path.join(userDataDir, 'workspace');
  assert.deepStrictEqual(roots, [workspaceDir]);
  assert.ok(fs.statSync(workspaceDir).isDirectory());

  // the in-app self-test lists '.', which resolves against the workspace
  fs.writeFileSync(path.join(workspaceDir, 'note.md'), '# hi');
  const gateway = new McpGateway({ allowedPaths: roots });
  const res = await gateway.callTool('list_directory', { path: '.' });
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(
    res.data.items.map((i) => i.name),
    ['note.md'],
  );
  assert.strictEqual((await gateway.callTool('list_directory', { path: '..' })).success, false);
});

test('MCP workspace: NOMAD_MCP_ALLOWED_PATHS overrides the packaged workspace', () => {
  const custom = path.resolve('/tmp/nomad-custom');
  const roots = resolveMcpAllowedPaths({
    isPackaged: true,
    userDataDir: path.join(os.tmpdir(), 'unused'),
    env: { NOMAD_MCP_ALLOWED_PATHS: custom },
  });
  assert.deepStrictEqual(roots, [custom]);
});

test('MCP workspace: dev runs keep the cwd default', () => {
  const roots = resolveMcpAllowedPaths({ isPackaged: false, userDataDir: '/unused', env: {} });
  assert.deepStrictEqual(roots, [path.resolve(process.cwd())]);
});
