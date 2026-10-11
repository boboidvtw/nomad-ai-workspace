import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Nomad AI Studio loads this extension into Electron, which lacks several Chrome APIs
 * (permissions, contextMenus, commands, alarms, notifications, downloads, ...). A top-level
 * `chrome.<missing>.onX.addListener(...)` throws while the module evaluates, and every
 * statement after it (including the runtime message router) never runs.
 */
const ELECTRON_MISSING_APIS = [
  'permissions',
  'contextMenus',
  'commands',
  'alarms',
  'notifications',
  'downloads',
  'identity',
  'sidePanel',
];

describe('background entry under Electron', () => {
  it('guards top-level listeners on APIs Electron does not provide', () => {
    const source = readFileSync(resolve(__dirname, '../index.ts'), 'utf8');
    const unguarded = source
      .split('\n')
      .map((line, i) => ({ line, no: i + 1 }))
      .filter(({ line }) =>
        ELECTRON_MISSING_APIS.some((api) =>
          new RegExp(`^chrome\\.${api}\\.\\w+\\.addListener\\(`).test(line),
        ),
      )
      .map(({ line, no }) => `${no}: ${line.trim()}`);
    expect(unguarded).toEqual([]);
  });
});
