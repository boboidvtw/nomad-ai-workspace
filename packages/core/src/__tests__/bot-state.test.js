const { describe, it } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const { BLOCKED_MANIFESTS, buildStateSnapshotScript, detectBlocked } = require('../../index');

describe('Bots - blocked-state manifests', () => {
  it('ships a manifest for every webview platform', () => {
    for (const platform of ['claude', 'chatgpt', 'gemini', 'grok']) {
      assert.ok(BLOCKED_MANIFESTS[platform].rules.length > 0, platform);
    }
  });

  it('detects a login redirect from the URL', () => {
    const res = detectBlocked('chatgpt', {
      url: 'https://chatgpt.com/auth/login',
      notices: [],
      selectorHits: [],
    });
    assert.strictEqual(res.blocked, true);
    assert.match(res.reason, /sign/i);
  });

  it('detects a usage-limit banner in alert or dialog text', () => {
    const res = detectBlocked('claude', {
      url: 'https://claude.ai/chat/abc',
      notices: ["You've reached your usage limit. Your limit resets at 5 PM."],
      selectorHits: [],
    });
    assert.strictEqual(res.blocked, true);
    assert.strictEqual(res.ruleId, 'usage-limit');
  });

  it('does not flag a normal conversation page', () => {
    const res = detectBlocked('claude', {
      url: 'https://claude.ai/chat/abc',
      notices: [],
      selectorHits: [],
    });
    assert.deepStrictEqual(res, { blocked: false });
  });

  it('flags a selector rule hit', () => {
    const rule = BLOCKED_MANIFESTS.chatgpt.rules.find((r) => r.type === 'selector');
    assert.ok(rule);
    const res = detectBlocked('chatgpt', {
      url: 'https://chatgpt.com/c/1',
      notices: [],
      selectorHits: [rule.id],
    });
    assert.strictEqual(res.blocked, true);
  });

  it('treats unknown platforms as never blocked', () => {
    assert.deepStrictEqual(
      detectBlocked('local-model', { url: '', notices: [], selectorHits: [] }),
      {
        blocked: false,
      },
    );
  });

  it('builds a snapshot script that runs in a page-like context', () => {
    const script = buildStateSnapshotScript('chatgpt');
    const alert = { innerText: 'Too many requests in 1 hour. Try again later.' };
    const context = {
      location: { href: 'https://chatgpt.com/c/1' },
      document: {
        querySelectorAll: (/** @type {string} */ sel) => (sel.includes('alert') ? [alert] : []),
        querySelector: () => null,
      },
    };

    const snapshot = JSON.parse(JSON.stringify(vm.runInNewContext(script, context)));

    assert.strictEqual(snapshot.url, 'https://chatgpt.com/c/1');
    assert.deepStrictEqual(snapshot.notices, ['Too many requests in 1 hour. Try again later.']);
    assert.strictEqual(detectBlocked('chatgpt', snapshot).blocked, true);
  });
});
