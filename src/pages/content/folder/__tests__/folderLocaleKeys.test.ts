import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FOLDER_DIR = resolve(process.cwd(), 'src/pages/content/folder');
const LOCALE_DIR = resolve(process.cwd(), 'src/locales');

function keysUsedByFolderModules(): string[] {
  const keys = new Set<string>();
  for (const file of readdirSync(FOLDER_DIR)) {
    if (!/\.ts$/.test(file)) continue;
    const source = readFileSync(resolve(FOLDER_DIR, file), 'utf8');
    for (const match of source.matchAll(/\bt\('([A-Za-z0-9_]+)'\)/g)) keys.add(match[1]);
  }
  return [...keys].sort();
}

describe('Folder module translation keys', () => {
  it('finds the keys it checks', () => {
    expect(keysUsedByFolderModules()).toEqual(
      expect.arrayContaining([
        'folder_default_name',
        'conversation_added_to_folder',
        'folder_import_in_progress',
      ]),
    );
  });

  it('defines every key the folder modules use in every locale', () => {
    const keys = keysUsedByFolderModules();
    for (const locale of readdirSync(LOCALE_DIR)) {
      const messages = JSON.parse(
        readFileSync(resolve(LOCALE_DIR, locale, 'messages.json'), 'utf8'),
      ) as Record<string, { message?: string }>;
      const missing = keys.filter((key) => !messages[key]?.message);
      expect(missing, `${locale} is missing keys`).toEqual([]);
    }
  });
});
