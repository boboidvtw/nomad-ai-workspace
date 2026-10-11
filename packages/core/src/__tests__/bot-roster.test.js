const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BotRoster, BOT_STATE, toBotHandle, TaskDispatcher } = require('../../index');

function tmpFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-bots-'));
  return path.join(dir, 'roster.json');
}

describe('Bots - handles', () => {
  it('derives @mention handles from display names', () => {
    assert.strictEqual(toBotHandle('Research Buddy'), 'research-buddy');
    assert.strictEqual(toBotHandle('  Dr. Foo!! '), 'dr-foo');
    assert.strictEqual(toBotHandle('42 Answers'), 'bot-42-answers');
    assert.strictEqual(toBotHandle('研究員'), '');
    assert.ok(toBotHandle('x'.repeat(80)).length <= 32);
  });
});

describe('Bots - BotRoster', () => {
  it('seeds the default roster as bots with short handles', () => {
    const roster = new BotRoster();
    const claude = roster.getAgent('agent-claude').data;
    assert.strictEqual(claude.handle, 'claude');
    assert.strictEqual(claude.state, BOT_STATE.IDLE);
    assert.strictEqual(claude.canonicalChat, null);
  });

  it('keeps bot fields when an agent is re-registered through the legacy API', () => {
    const roster = new BotRoster();
    roster.updateBot('agent-claude', { persona: 'You are the lead architect.' });

    roster.registerAgent({ id: 'agent-claude', name: 'Claude Lead Architect', skills: ['x'] });

    const claude = roster.getAgent('agent-claude').data;
    assert.strictEqual(claude.persona, 'You are the lead architect.');
    assert.deepStrictEqual(claude.skills, ['x']);
  });

  it('updates bots immutably and recomputes the handle from displayName', () => {
    const roster = new BotRoster();
    const before = roster.agents.get('agent-gemini');

    const res = roster.updateBot('agent-gemini', { displayName: 'Research Buddy', avatar: '🔭' });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data.handle, 'research-buddy');
    assert.notStrictEqual(roster.agents.get('agent-gemini'), before);
    assert.strictEqual(before.avatar, undefined);
  });

  it('rejects a handle that another bot already uses', () => {
    const roster = new BotRoster();
    const res = roster.updateBot('agent-gemini', { displayName: 'Claude' });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.errorCode, 'BOT_HANDLE_CONFLICT_001');
  });

  it('ignores unknown or runtime-only fields in updateBot', () => {
    const roster = new BotRoster();
    const res = roster.updateBot('agent-grok', { currentTaskIds: ['t1'], evil: true });
    assert.deepStrictEqual(res.data.currentTaskIds, []);
    assert.strictEqual(/** @type {any} */ (res.data).evil, undefined);
  });

  it('resolves mentions by handle, id, or old name', () => {
    const roster = new BotRoster();
    roster.updateBot('agent-gemini', { displayName: 'Research Buddy' });

    assert.strictEqual(roster.resolveMention('@research-buddy').data.id, 'agent-gemini');
    assert.strictEqual(roster.resolveMention('@ResearchBuddy').data.id, 'agent-gemini');
    assert.strictEqual(roster.resolveMention('agent-gemini').data.id, 'agent-gemini');
    assert.strictEqual(roster.resolveMention('@nobody').success, false);
  });

  it('refuses to remove a bot that still holds tasks', () => {
    const dispatcher = new TaskDispatcher({ roster: new BotRoster() });
    const task = dispatcher.createTask({ title: 'Busy work' }).data;
    dispatcher.claimTask(task.id, 'agent-claude');

    const res = dispatcher.roster.removeBot('agent-claude');

    assert.strictEqual(res.errorCode, 'BOT_HAS_ACTIVE_TASKS_002');
    assert.ok(dispatcher.roster.getAgent('agent-claude').success);
  });

  it('removes an idle bot', () => {
    const roster = new BotRoster();
    assert.strictEqual(roster.removeBot('agent-grok').success, true);
    assert.strictEqual(roster.getAgent('agent-grok').success, false);
  });

  it('persists bots to disk and restores them without runtime state', async () => {
    const file = tmpFile();
    const roster = new BotRoster({ storagePath: file });
    roster.registerAgent({ id: 'bot-scribe', name: 'Scribe', platform: 'chatgpt' });
    roster.updateBot('bot-scribe', { persona: 'Write minutes.' });
    roster.bindCanonicalChat('bot-scribe', { platform: 'chatgpt', url: 'https://chatgpt.com/c/1' });
    roster.agents.get('bot-scribe').currentTaskIds.push('t-stale');
    const saved = await roster.saveToDisk();
    assert.strictEqual(saved.success, true);

    const restored = new BotRoster({ storagePath: file });
    const loaded = restored.loadFromDisk();

    assert.strictEqual(loaded.success, true);
    const scribe = restored.getAgent('bot-scribe').data;
    assert.strictEqual(scribe.persona, 'Write minutes.');
    assert.strictEqual(scribe.canonicalChat.url, 'https://chatgpt.com/c/1');
    assert.deepStrictEqual(scribe.currentTaskIds, []);
  });

  it('auto-persists every bot change when a storage path is given', () => {
    const file = tmpFile();
    const roster = new BotRoster({ storagePath: file });
    roster.updateBot('agent-claude', { avatar: '🦉' });
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(onDisk.bots.find((b) => b.id === 'agent-claude').avatar, '🦉');
  });

  it('quarantines a corrupt roster file and keeps the seed roster', () => {
    const file = tmpFile();
    fs.writeFileSync(file, '{ not json');
    const roster = new BotRoster({ storagePath: file });

    const res = roster.loadFromDisk();

    assert.strictEqual(res.errorCode, 'BOT_STORAGE_LOAD_FAILED_004');
    assert.ok(roster.getAgent('agent-claude').success);
    assert.ok(fs.readdirSync(path.dirname(file)).some((f) => f.includes('.corrupt')));
  });

  it('exports a Drive sync payload without chat URLs or runtime state', () => {
    const roster = new BotRoster();
    roster.updateBot('agent-claude', { persona: 'Architect' });
    roster.bindCanonicalChat('agent-claude', {
      platform: 'claude',
      url: 'https://claude.ai/chat/x',
    });

    const payload = roster.toSyncPayload();
    const claude = payload.bots.find((b) => b.id === 'agent-claude');

    assert.strictEqual(claude.persona, 'Architect');
    assert.strictEqual(claude.canonicalChat, undefined);
    assert.strictEqual(claude.state, undefined);
    assert.strictEqual(claude.currentTaskIds, undefined);
  });

  it('merges a Drive sync payload while keeping local chat bindings', () => {
    const roster = new BotRoster();
    roster.bindCanonicalChat('agent-claude', {
      platform: 'claude',
      url: 'https://claude.ai/chat/x',
    });

    const res = roster.applySyncPayload({
      version: 1,
      bots: [
        { id: 'agent-claude', name: 'Claude Lead Architect', persona: 'From Drive' },
        { id: 'bot-new', name: 'New Bot', platform: 'gemini' },
      ],
    });

    assert.strictEqual(res.success, true);
    const claude = roster.getAgent('agent-claude').data;
    assert.strictEqual(claude.persona, 'From Drive');
    assert.strictEqual(claude.canonicalChat.url, 'https://claude.ai/chat/x');
    assert.ok(roster.getAgent('bot-new').success);
  });

  it('emits bot events for live UIs', () => {
    /** @type {string[]} */
    const events = [];
    const roster = new BotRoster({ onEvent: (type) => events.push(type) });
    roster.updateBot('agent-claude', { avatar: '🦉' });
    roster.setBotState('agent-claude', 'working');
    roster.removeBot('agent-grok');
    assert.deepStrictEqual(events, ['bot:updated', 'bot:updated', 'bot:removed']);
  });
});
