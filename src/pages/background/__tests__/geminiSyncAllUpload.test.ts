import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Sync All lives inline in index.ts on some branches and in multiPlatformFolderSync.ts on others.
const SYNC_ALL_SOURCES = [
  'src/pages/background/index.ts',
  'src/pages/background/multiPlatformFolderSync.ts',
].filter((file) => existsSync(resolve(file)));

describe('Sync All Gemini upload', () => {
  it('uploads the full FolderData, not just the folder list', () => {
    const sources = SYNC_ALL_SOURCES.map((file) => readFileSync(resolve(file), 'utf8'));

    expect(sources.some((source) => source.includes('uploadGeminiFolders('))).toBe(true);
    for (const source of sources) {
      // `.folders` alone drops folderContents, i.e. which conversations sit in which folder.
      expect(source).not.toMatch(/uploadGeminiFolders\(\s*[\w.]+\.folders\b/);
    }
  });
});
