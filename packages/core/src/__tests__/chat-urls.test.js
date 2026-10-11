const { describe, it } = require('node:test');
const assert = require('node:assert');
const { isConversationUrl, isSameConversation, BotRoster } = require('../../index');

describe('Bots - canonical chat URLs', () => {
  it('accepts real conversation URLs per platform', () => {
    assert.ok(isConversationUrl('claude', 'https://claude.ai/chat/1f2e-abc'));
    assert.ok(isConversationUrl('chatgpt', 'https://chatgpt.com/c/68a1-ff?model=x'));
    assert.ok(isConversationUrl('chatgpt', 'https://chatgpt.com/g/g-abc/c/68a1'));
    assert.ok(isConversationUrl('gemini', 'https://gemini.google.com/u/1/app/a1b2c3'));
    assert.ok(isConversationUrl('grok', 'https://grok.com/c/abc-123/'));
  });

  it('rejects home pages, other hosts and unknown platforms', () => {
    assert.ok(!isConversationUrl('claude', 'https://claude.ai/new'));
    assert.ok(!isConversationUrl('chatgpt', 'https://chatgpt.com/'));
    assert.ok(!isConversationUrl('claude', 'https://evil.example/chat/1'));
    assert.ok(!isConversationUrl('claude', 'http://claude.ai/chat/1'));
    assert.ok(!isConversationUrl('local-model', 'https://claude.ai/chat/1'));
    assert.ok(!isConversationUrl('claude', 'not a url'));
  });

  it('compares conversations ignoring query and trailing slash', () => {
    assert.ok(isSameConversation('https://grok.com/c/1/', 'https://grok.com/c/1?x=1'));
    assert.ok(!isSameConversation('', ''));
  });

  it('refuses to bind a bot to a non-conversation URL', () => {
    const roster = new BotRoster();
    const res = roster.bindCanonicalChat('agent-claude', {
      platform: 'claude',
      url: 'https://evil.example/',
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(roster.getAgent('agent-claude').data.canonicalChat, null);
  });

  it('allows clearing a binding with a null URL', () => {
    const roster = new BotRoster();
    roster.bindCanonicalChat('agent-claude', {
      platform: 'claude',
      url: 'https://claude.ai/chat/a',
    });
    const res = roster.bindCanonicalChat('agent-claude', { platform: 'claude', url: null });
    assert.strictEqual(res.data.canonicalChat.url, null);
  });
});
