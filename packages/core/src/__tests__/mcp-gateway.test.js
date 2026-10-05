const { test } = require('node:test');
const assert = require('node:assert');
const { McpGateway, isOk, isErr, ErrorCodes } = require('../../index');

test('McpGateway: lists default tools and executes read_file safely', async () => {
  const gateway = new McpGateway();

  const toolsRes = gateway.listTools();
  assert.strictEqual(isOk(toolsRes), true);
  const toolNames = toolsRes.data.map(t => t.name);
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
