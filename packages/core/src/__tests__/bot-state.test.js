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

  // Text seen on grok.com on 2026-11-02, right after the prompt it refused.
  const GROK_CAPACITY_TAIL =
    '請用一句話說明什麼是布林通道。\n\n需求量高\nGrok 目前使用人數較多，請稍後再試，或升級你的方案以獲得優先使用權\n升級至 Super\n\n快速\nGrok 已完成回覆\n上傳文件';

  it('flags the Grok capacity notice that sits at the end of the conversation', () => {
    const res = detectBlocked('grok', {
      url: 'https://grok.com/c/abc',
      notices: [],
      selectorHits: [],
      tail: GROK_CAPACITY_TAIL,
    });
    assert.strictEqual(res.blocked, true);
    assert.strictEqual(res.ruleId, 'high-demand');
  });

  it('does not flag a capacity notice that a later reply has pushed out of the tail', () => {
    const res = detectBlocked('grok', {
      url: 'https://grok.com/c/abc',
      notices: [],
      selectorHits: [],
      tail: 'Grok\n運作了5s\n\n布林通道是以移動平均線為中軌、上下加減標準差形成的價格通道。\n\n快速\n上傳文件',
    });
    assert.deepStrictEqual(res, { blocked: false });
  });

  it('collects the page tail only for platforms with tail rules', () => {
    const body = { innerText: `${'x'.repeat(5000)}${GROK_CAPACITY_TAIL}` };
    const context = (/** @type {string} */ href) => ({
      location: { href },
      document: { body, querySelectorAll: () => [], querySelector: () => null },
    });

    const grok = JSON.parse(
      JSON.stringify(
        vm.runInNewContext(buildStateSnapshotScript('grok'), context('https://grok.com/c/1')),
      ),
    );
    const claude = JSON.parse(
      JSON.stringify(
        vm.runInNewContext(buildStateSnapshotScript('claude'), context('https://claude.ai/chat/1')),
      ),
    );

    assert.ok(grok.tail.length < 1000, 'only the end of the page is read');
    assert.strictEqual(detectBlocked('grok', grok).ruleId, 'high-demand');
    assert.strictEqual(claude.tail, undefined);
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
