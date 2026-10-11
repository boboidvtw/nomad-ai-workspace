const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { McpGateway } = require('@nomad/core');
const { createStudioBots } = require('../studio-bots.js');

function build() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-studio-bots-'));
  const mcpGateway = new McpGateway({ allowedPaths: [] });
  const bots = createStudioBots({
    rosterPath: path.join(dir, 'roster.json'),
    roomsPath: path.join(dir, 'rooms.json'),
    inject: async (platform) => ({ [platform]: { ok: true } }),
    awaitSettled: async () => ({ settled: true, text: 'studio reply' }),
    openChat: async () => ({ ok: true }),
    currentUrl: async () => 'https://claude.ai/chat/s1',
    notify: () => {},
    mcpGateway,
  });
  return { bots, mcpGateway };
}

test('wires the router into the bridge and the message_agent tool into MCP', async () => {
  const { bots, mcpGateway } = build();
  const bridge = { botServices: /** @type {any} */ ({ roster: bots.roster, router: null }) };

  bots.attach(bridge);
  const res = await mcpGateway.callTool('message_agent', { target: 'claude', message: 'hi' });

  assert.strictEqual(bridge.botServices.router, bots.router);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data.reply, 'studio reply');
  assert.strictEqual(
    bots.roster.getAgent('agent-claude').data.canonicalChat.url,
    'https://claude.ai/chat/s1',
  );
});

test('runs group rooms and streams room events through the bridge', async () => {
  const { bots } = build();
  /** @type {string[]} */
  const events = [];
  const bridge = {
    botServices: /** @type {any} */ ({ roster: bots.roster }),
    broadcast: (/** @type {string} */ type) => events.push(type),
  };
  bots.attach(bridge);

  const room = bots.rooms.create({ name: 'Standup', memberIds: ['agent-claude'] }).data;
  bots.rooms.post(room.id, { text: 'status?' });
  await bots.rooms.whenIdle(room.id);

  assert.strictEqual(bridge.botServices.rooms, bots.rooms);
  assert.ok(events.includes('room:message'));
});

test('routes herdr bots to the herdr runner and tracks their state', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-studio-herdr-'));
  const bots = createStudioBots({
    rosterPath: path.join(dir, 'roster.json'),
    roomsPath: path.join(dir, 'rooms.json'),
    inject: async () => ({}),
    awaitSettled: async () => ({ settled: false, text: '' }),
    openChat: async () => ({ ok: true }),
    currentUrl: async () => null,
    notify: () => {},
    herdrRunner: {
      run: async (bot) => ({ success: true, data: { text: `cli ${bot.handle}` } }),
      isAvailable: async () => true,
    },
  });
  bots.roster.registerAgent({ id: 'bot-reviewer', name: 'Reviewer', platform: 'herdr' });
  const reviewer = bots.roster.getAgent('bot-reviewer').data;

  const res = await bots.runTask('herdr', 'review', { agent: reviewer });
  const bridge = { botServices: /** @type {any} */ ({ roster: bots.roster }) };
  bots.attach(bridge);

  assert.strictEqual(res.data.text, 'cli reviewer');
  assert.strictEqual(bots.roster.getAgent('bot-reviewer').data.state, 'done');
  assert.deepStrictEqual(await bridge.botServices.capabilities(), { herdr: true });
});

test('bots.enabled = false falls back to plain webview runs with no routing or persistence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-studio-off-'));
  const rosterPath = path.join(dir, 'roster.json');
  /** @type {any[]} */
  const opened = [];
  const bots = createStudioBots({
    enabled: false,
    rosterPath,
    roomsPath: path.join(dir, 'rooms.json'),
    inject: async (platform) => ({ [platform]: { ok: true } }),
    awaitSettled: async () => ({ settled: true, text: 'plain reply' }),
    openChat: async (...args) => {
      opened.push(args);
      return { ok: true };
    },
    currentUrl: async () => 'https://claude.ai/chat/x',
    notify: () => {},
  });
  const bridge = { botServices: /** @type {any} */ ({ roster: bots.roster, router: null }) };
  bots.attach(bridge);

  const res = await bots.runTask('claude', 'hi', {
    agent: bots.roster.getAgent('agent-claude').data,
  });
  bots.roster.updateBot('agent-claude', { persona: 'x' });

  assert.strictEqual(res.data.text, 'plain reply');
  assert.strictEqual(opened.length, 0, 'no canonical chat navigation');
  assert.strictEqual(bridge.botServices.router, null);
  assert.ok(!fs.existsSync(rosterPath), 'nothing persisted');
});
