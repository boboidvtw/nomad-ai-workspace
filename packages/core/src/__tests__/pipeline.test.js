const { test } = require('node:test');
const assert = require('node:assert');
const {
  estimateTokens,
  compress,
  decide,
  PipelineManager,
  isOk,
  isErr,
  ErrorCodes,
} = require('../../index');

test('Headroom: estimateTokens correctly weights Western vs CJK characters', () => {
  const western = 'Hello world, this is a test.'; // 28 chars -> ~7 tokens
  const westernTokens = estimateTokens(western);
  assert.ok(westernTokens >= 5 && westernTokens <= 10, `Western tokens was ${westernTokens}`);

  const cjk = '你好世界，這是一個繁體中文測試。'; // 16 chars -> ~11 tokens
  const cjkTokens = estimateTokens(cjk);
  assert.ok(cjkTokens >= 8 && cjkTokens <= 15, `CJK tokens was ${cjkTokens}`);
});

test('Headroom: compress eliminates conversational fluff and normalizes newlines', () => {
  const fluffPrompt =
    '你好！我是AI助理，很高興為您服務。\n\n\n\n請問有什麼我可以幫忙的？\n\n請分析以下程式碼：\nconst a = 1;   \n';
  const res = compress(fluffPrompt, { level: 'balanced' });

  assert.strictEqual(isOk(res), true);
  assert.strictEqual(res.data.savedTokens > 0, true);
  assert.strictEqual(res.data.savingsRatio > 0, true);
  // Verify fluff is stripped and 4 newlines collapsed
  assert.ok(!res.data.text.includes('我是AI助理'));
  assert.ok(!res.data.text.includes('\n\n\n'));
  assert.ok(res.data.text.includes('請分析以下程式碼'));
});

test('Headroom: compress truncates middle context safely when maxTokens is exceeded', () => {
  const lines = [];
  lines.push('SYSTEM: You are an autonomous agent adhering to atomic contract.');
  for (let i = 1; i <= 30; i++) {
    lines.push(`TURN ${i}: This is history turn log #${i} with extended context information.`);
  }
  lines.push('USER: Please execute the latest bug fix immediately.');

  const bigText = lines.join('\n');
  const res = compress(bigText, { maxTokens: 40 });

  assert.strictEqual(isOk(res), true);
  assert.ok(res.data.text.includes('SYSTEM: You are an autonomous agent'));
  assert.ok(res.data.text.includes('USER: Please execute the latest bug fix'));
  assert.ok(res.data.text.includes('Headroom: 已壓縮並省略中間'));
  assert.ok(res.data.compressedTokens < res.data.originalTokens);
});

test('Laya: decide completes sub-millisecond intent classification & platform affinity', () => {
  const res = decide('發現記憶體洩漏與報錯異常，請立刻 debug 並修復此 Bug');

  assert.strictEqual(isOk(res), true);
  assert.strictEqual(res.data.intent, 'debug');
  assert.strictEqual(res.data.recommendedPlatform, 'claude');
  assert.strictEqual(res.data.tags.includes('除錯修復'), true);
  assert.ok(res.data.latencyMs >= 0, `Latency: ${res.data.latencyMs}ms`);
});

test('Laya: decide injects smart directive when enhance is enabled', () => {
  const raw = '設計一個微服務架構規範與 DDL schema';
  const res = decide(raw, { enhance: true });

  assert.strictEqual(isOk(res), true);
  assert.strictEqual(res.data.intent, 'architecture');
  assert.strictEqual(res.data.enhanced, true);
  assert.ok(res.data.enhancedPrompt.includes('Laya 前向決策引導'));
  assert.ok(res.data.enhancedPrompt.includes('Mermaid 架構圖'));
});

test('PipelineManager: executes end-to-end compression, decision, and collects telemetry', () => {
  const pm = new PipelineManager({
    headroomEnabled: true,
    layaEnabled: true,
    autoEnhance: true,
  });

  const prompt = '好的，馬上為您處理。\n\n\n請優化此 React 元件的效能，收斂複雜度並消除壞味道。';
  const result = pm.process({ prompt });

  assert.strictEqual(isOk(result), true);
  assert.ok(result.data.pipelineId.startsWith('pipe-'));
  assert.strictEqual(result.data.laya.intent, 'refactor');
  assert.ok(result.data.headroom.savedTokens > 0);
  assert.ok(result.data.processedPrompt.includes('Laya 前向決策引導'));

  const stats = pm.getStats();
  assert.strictEqual(stats.totalProcessed, 1);
  assert.ok(stats.totalSavedTokens > 0);
  assert.strictEqual(stats.intents.refactor, 1);
});

test('Pipeline: error safety on invalid input', () => {
  const pm = new PipelineManager();
  const invalid = pm.process({ prompt: null, context: null });
  assert.strictEqual(isErr(invalid), true);
  assert.strictEqual(invalid.errorCode, ErrorCodes.PIPELINE_INVALID_INPUT_003);
});
