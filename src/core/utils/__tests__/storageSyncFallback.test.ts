import { describe, expect, it, vi } from 'vitest';

import {
  SYNC_FALLBACK_PREFIX,
  installStorageSyncFallback,
  isElectronRuntime,
  splitFallbackChanges,
} from '../storageSyncFallback';

const ELECTRON_UA =
  'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0.0.0 Electron/38.0.0 Safari/537.36';
const CHROME_UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36';

type Listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;

/** In-memory chrome.storage with a callback-style local area and onChanged. */
function createFakeStorage(initial: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...initial };
  const listeners: Listener[] = [];
  const emit = (changes: Record<string, chrome.storage.StorageChange>) =>
    listeners.slice().forEach((listener) => listener(changes, 'local'));

  const local = {
    get(keys: unknown, callback: (items: Record<string, unknown>) => void) {
      if (keys == null) return callback({ ...data });
      if (typeof keys === 'string') return callback(keys in data ? { [keys]: data[keys] } : {});
      if (Array.isArray(keys)) {
        return callback(Object.fromEntries(keys.filter((k) => k in data).map((k) => [k, data[k]])));
      }
      const defaults = keys as Record<string, unknown>;
      callback(
        Object.fromEntries(Object.entries(defaults).map(([k, v]) => [k, k in data ? data[k] : v])),
      );
    },
    set(items: Record<string, unknown>, callback: () => void) {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data[k], newValue: v };
        data[k] = v;
      }
      callback();
      emit(changes);
    },
    remove(keys: string | string[], callback: () => void) {
      const changes: Record<string, chrome.storage.StorageChange> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (!(k in data)) continue;
        changes[k] = { oldValue: data[k] };
        delete data[k];
      }
      callback();
      if (Object.keys(changes).length > 0) emit(changes);
    },
    getBytesInUse(keys: string[] | null, callback: (bytes: number) => void) {
      const selected = keys ?? Object.keys(data);
      callback(selected.filter((k) => k in data).length * 10);
    },
  };
  const syncThatThrows = {
    get: () => {
      throw new Error('"sync" is not available in this instance of Chrome');
    },
  };
  const onChanged = {
    addListener: (listener: Listener) => listeners.push(listener),
    removeListener: (listener: Listener) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
    hasListener: (listener: Listener) => listeners.includes(listener),
  };
  const chromeApi = {
    storage: { local, sync: syncThatThrows as unknown, onChanged },
  };
  return { chromeApi, data, listeners };
}

function installed(initial?: Record<string, unknown>) {
  const fake = createFakeStorage(initial);
  expect(installStorageSyncFallback(fake.chromeApi, ELECTRON_UA)).toBe(true);
  const sync = fake.chromeApi.storage.sync as chrome.storage.SyncStorageArea;
  return { ...fake, sync };
}

describe('isElectronRuntime', () => {
  it('detects the Electron user agent only', () => {
    expect(isElectronRuntime(ELECTRON_UA)).toBe(true);
    expect(isElectronRuntime(CHROME_UA)).toBe(false);
    expect(isElectronRuntime('')).toBe(false);
  });
});

describe('installStorageSyncFallback', () => {
  it('leaves chrome.storage.sync untouched outside Electron', () => {
    const fake = createFakeStorage();
    const originalSync = fake.chromeApi.storage.sync;
    const originalAdd = fake.chromeApi.storage.onChanged.addListener;
    expect(installStorageSyncFallback(fake.chromeApi, CHROME_UA)).toBe(false);
    expect(fake.chromeApi.storage.sync).toBe(originalSync);
    expect(fake.chromeApi.storage.onChanged.addListener).toBe(originalAdd);
  });

  it('does nothing without a storage API', () => {
    expect(installStorageSyncFallback({ storage: {} }, ELECTRON_UA)).toBe(false);
    expect(installStorageSyncFallback({}, ELECTRON_UA)).toBe(false);
  });

  it('is idempotent', () => {
    const { chromeApi, sync } = installed();
    expect(installStorageSyncFallback(chromeApi, ELECTRON_UA)).toBe(true);
    expect(chromeApi.storage.sync).toBe(sync);
  });

  it('stores sync keys in local under a prefix', async () => {
    const { sync, data } = installed({ theme: 'local-theme' });
    await sync.set({ theme: 'dark', count: 2 });
    expect(data).toEqual({
      theme: 'local-theme',
      [`${SYNC_FALLBACK_PREFIX}theme`]: 'dark',
      [`${SYNC_FALLBACK_PREFIX}count`]: 2,
    });
  });

  it('supports every get key form with promises and callbacks', async () => {
    const { sync } = installed({ other: 'x', [`${SYNC_FALLBACK_PREFIX}a`]: 1 });
    await sync.set({ b: 2 });

    expect(await sync.get('a')).toEqual({ a: 1 });
    expect(await sync.get(['a', 'missing'])).toEqual({ a: 1 });
    expect(await sync.get({ a: 0, c: 'default' })).toEqual({
      a: 1,
      c: 'default',
    });
    expect(await sync.get(null)).toEqual({ a: 1, b: 2 });
    expect(await sync.get()).toEqual({ a: 1, b: 2 });

    const callback = vi.fn();
    sync.get({ b: 0 }, callback);
    expect(callback).toHaveBeenCalledWith({ b: 2 });
  });

  it('removes and clears only its own keys', async () => {
    const { sync, data } = installed({ keep: true });
    await sync.set({ a: 1, b: 2, c: 3 });
    await sync.remove('a');
    expect(await sync.get(null)).toEqual({ b: 2, c: 3 });

    const done = vi.fn();
    sync.clear(done);
    expect(done).toHaveBeenCalled();
    expect(data).toEqual({ keep: true });
  });

  it('reports bytes in use for its own keys', async () => {
    const { sync } = installed({ keep: true });
    await sync.set({ a: 1, b: 2 });
    expect(await sync.getBytesInUse('a')).toBe(10);
    expect(await sync.getBytesInUse(['a', 'b'])).toBe(20);
  });

  it('rejects the promise when the local call sets runtime.lastError', async () => {
    const { sync } = installed();
    const runtime = (globalThis.chrome as unknown as { runtime: { lastError: unknown } }).runtime;
    runtime.lastError = { message: 'quota exceeded' };
    try {
      await expect(sync.set({ a: 1 })).rejects.toThrow('quota exceeded');
    } finally {
      runtime.lastError = null;
    }
  });

  it("reports fallback writes to onChanged as 'sync' and plain writes as 'local'", async () => {
    const { chromeApi, sync } = installed();
    const listener = vi.fn();
    chromeApi.storage.onChanged.addListener(listener);

    await sync.set({ gvVisualEffect: 'snow' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(
      { gvVisualEffect: { oldValue: undefined, newValue: 'snow' } },
      'sync',
    );

    await new Promise<void>((resolve) => chromeApi.storage.local.set({ plain: 1 }, resolve));
    expect(listener).toHaveBeenLastCalledWith(
      { plain: { oldValue: undefined, newValue: 1 } },
      'local',
    );

    expect(chromeApi.storage.onChanged.hasListener(listener)).toBe(true);
    chromeApi.storage.onChanged.removeListener(listener);
    expect(chromeApi.storage.onChanged.hasListener(listener)).toBe(false);
    await sync.set({ gvVisualEffect: 'rain' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('fires the area-specific sync.onChanged only for sync changes', async () => {
    const { chromeApi, sync } = installed();
    const listener = vi.fn();
    sync.onChanged.addListener(listener);

    await new Promise<void>((resolve) => chromeApi.storage.local.set({ plain: 1 }, resolve));
    expect(listener).not.toHaveBeenCalled();

    await sync.set({ a: 1 });
    expect(listener).toHaveBeenCalledWith({
      a: { oldValue: undefined, newValue: 1 },
    });

    sync.onChanged.removeListener(listener);
    await sync.set({ a: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('splitFallbackChanges', () => {
  it('separates prefixed keys from plain local keys', () => {
    expect(
      splitFallbackChanges({
        [`${SYNC_FALLBACK_PREFIX}a`]: { newValue: 1 },
        b: { newValue: 2 },
      }),
    ).toEqual({ sync: { a: { newValue: 1 } }, local: { b: { newValue: 2 } } });
  });
});
