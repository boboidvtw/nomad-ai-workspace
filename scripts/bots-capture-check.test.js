import { mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildProbe,
  classifyResult,
  compareChats,
  isEntryPoint,
  parseArgs,
  summarize,
} from './bots-capture-check.mjs';

describe('bots-capture-check', () => {
  it('builds a probe whose message carries its one-time code', () => {
    const probe = buildProbe('claude', 3, 'abc123');
    expect(probe.code).toBe('NC-claude-3-abc123');
    expect(probe.message).toContain(probe.code);
  });

  it('classifies captured, mismatched, blocked, timed-out and failed runs', () => {
    const code = 'NC-x-1-aaaaaa';
    expect(classifyResult({ success: true, data: { reply: `ok ${code}` } }, code)).toBe('captured');
    expect(classifyResult({ success: true, data: { reply: 'Delegated to webview' } }, code)).toBe(
      'mismatch',
    );
    const timeout = { success: false, errorCode: 'BOT_RESPONSE_TIMEOUT_005' };
    expect(classifyResult({ ...timeout, message: 'claude stayed blocked: usage' }, code)).toBe(
      'blocked',
    );
    expect(classifyResult({ ...timeout, message: 'did not finish replying' }, code)).toBe(
      'timeout',
    );
    expect(classifyResult({ success: false, errorCode: 'OTHER', message: 'x' }, code)).toBe(
      'error',
    );
  });

  it('summarizes capture rate against the target and collects chat URLs', () => {
    const records = [
      ...Array.from({ length: 9 }, () => ({
        bot: 'a',
        outcome: 'captured',
        chatUrl: 'u1',
      })),
      { bot: 'a', outcome: 'timeout', chatUrl: 'u1' },
      { bot: 'b', outcome: 'captured', chatUrl: 'u2' },
      { bot: 'b', outcome: 'mismatch', chatUrl: 'u3' },
    ];
    const s = summarize(records, 0.9);
    expect(s.a).toMatchObject({
      runs: 10,
      captured: 9,
      pass: true,
      chatUrls: ['u1'],
    });
    expect(s.a.outcomes).toEqual({ captured: 9, timeout: 1 });
    expect(s.b).toMatchObject({
      runs: 2,
      captured: 1,
      pass: false,
      chatUrls: ['u2', 'u3'],
    });
  });

  it('compares canonical chats with the previous report', () => {
    const previous = {
      a: { chatUrls: ['old', 'u1'] },
      b: { chatUrls: ['u2'] },
    };
    const current = {
      a: { chatUrls: ['u1'] },
      b: { chatUrls: ['u9'] },
      c: { chatUrls: ['u3'] },
    };
    expect(compareChats(previous, current)).toEqual({ a: true, b: false });
    expect(compareChats(null, current)).toEqual({});
  });

  it('parses options and rejects unknown flags', () => {
    expect(parseArgs(['--runs', '3', '--bots', 'claude,gemini'])).toMatchObject({
      runs: 3,
      bots: ['claude', 'gemini'],
      port: 8765,
      target: 0.9,
    });
    expect(() => parseArgs(['--nope', '1'])).toThrow('Unknown option --nope');
  });

  it('detects the entry point through symlinked paths such as /tmp -> /private/tmp', () => {
    const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'nomad-entry-')));
    const real = path.join(dir, 'script.mjs');
    writeFileSync(real, '');
    const link = path.join(dir, 'link.mjs');
    symlinkSync(real, link);
    const metaUrl = pathToFileURL(real).href;
    expect(isEntryPoint(metaUrl, link)).toBe(true);
    expect(isEntryPoint(metaUrl, real)).toBe(true);
    expect(isEntryPoint(metaUrl, path.join(dir, 'other.mjs'))).toBe(false);
    expect(isEntryPoint(metaUrl, undefined)).toBe(false);
  });
});
