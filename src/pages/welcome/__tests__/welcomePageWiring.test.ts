import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('welcome page wiring', () => {
  it('is a build input of every browser config, since no manifest entry references it', () => {
    for (const config of [
      'vite.config.chrome.ts',
      'vite.config.firefox.ts',
      'vite.config.safari.ts',
    ]) {
      expect(read(config), config).toContain('src/pages/welcome/index.html');
    }
  });

  it('is not exposed to web pages', () => {
    const manifest = JSON.parse(read('manifest.json')) as {
      web_accessible_resources?: Array<{ resources: string[] }>;
    };
    const resources = manifest.web_accessible_resources?.flatMap((e) => e.resources) ?? [];
    expect(resources.some((r) => r.includes('welcome'))).toBe(false);
    expect(resources).not.toContain('src/*');
  });

  it('is opened by the background on install', () => {
    expect(read('src/pages/background/index.ts')).toContain('registerWelcomePageOnInstall();');
  });
});
