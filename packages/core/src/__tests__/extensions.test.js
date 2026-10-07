const test = require('node:test');
const assert = require('node:assert/strict');
const { extractVariables, interpolate, formatChatToMarkdown } = require('../../index');

test('Template Parser: extractVariables parses {{var}} and defaults', () => {
  const tpl = '請幫我把 {{code}} 重構為 {{lang:TypeScript}}，風格參考 {{style:Google}}。';
  const res = extractVariables(tpl);
  assert.equal(res.success, true);
  assert.equal(res.data.length, 3);
  assert.deepEqual(res.data[0], { name: 'code', defaultValue: '' });
  assert.deepEqual(res.data[1], { name: 'lang', defaultValue: 'TypeScript' });
  assert.deepEqual(res.data[2], { name: 'style', defaultValue: 'Google' });
});

test('Template Parser: interpolate replaces values correctly and falls back to defaults', () => {
  const tpl = 'Hello {{name}}, welcome to {{project:Nomad AI}}!';
  const res = interpolate(tpl, { name: 'Bobo' });
  assert.equal(res.success, true);
  assert.equal(res.data.rendered, 'Hello Bobo, welcome to Nomad AI!');
  assert.equal(res.data.unreplaced.length, 0);

  const res2 = interpolate(tpl, {});
  assert.equal(res2.data.unreplaced.length, 1);
  assert.equal(res2.data.unreplaced[0], 'name');
  assert.equal(res2.data.rendered, 'Hello {{name}}, welcome to Nomad AI!');
});

test('Markdown Exporter: formatChatToMarkdown formats conversation with headers and count', () => {
  const res = formatChatToMarkdown({
    title: '架構重構討論',
    platform: 'Claude 3.7 Sonnet',
    date: '2026-10-04T12:00:00Z',
    messages: [
      { role: 'user', content: '如何優化 Monorepo 的微服務通訊？' },
      { role: 'assistant', content: '建議採用主從握手協定（Handshake Protocol）搭配反向代理。' },
    ],
  });

  assert.equal(res.success, true);
  assert.ok(res.data.markdown.includes('# 架構重構討論'));
  assert.ok(res.data.markdown.includes('Claude 3.7 Sonnet'));
  assert.ok(res.data.markdown.includes('👤 使用者 (User)'));
  assert.ok(res.data.markdown.includes('🤖 Claude 3.7 Sonnet (Assistant)'));
  assert.equal(res.data.messageCount, 2);
  assert.ok(res.data.wordCount > 30);
});
