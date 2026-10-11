/**
 * `chrome.storage.sync` fallback for Electron (Nomad AI Studio).
 *
 * Electron loads the extension but has no sync backend: every
 * `chrome.storage.sync` call fails with `"sync" is not available in this
 * instance of Chrome`, so settings fall back to defaults and are never saved.
 * Inside Electron only, this replaces `chrome.storage.sync` with an area that
 * stores its keys in `chrome.storage.local` under a prefix (so they cannot
 * collide with keys the extension already keeps in local) and reports their
 * changes to `onChanged` listeners as `'sync'`. Chrome, Firefox and Safari
 * are left untouched.
 *
 * Import this module first in every extension entry point: it installs itself
 * on import, before any other module touches `chrome.storage.sync`.
 */

export const SYNC_FALLBACK_PREFIX = '__nomadSync__:';

type Items = Record<string, unknown>;
type Keys = string | string[] | Items | null | undefined;
type Changes = Record<string, chrome.storage.StorageChange>;
type ChangeListener = (changes: Changes, areaName: string) => void;
type AreaChangeListener = (changes: Changes) => void;

interface CallbackArea {
  get(keys: Keys, callback: (items: Items) => void): void;
  set(items: Items, callback: () => void): void;
  remove(keys: string | string[], callback: () => void): void;
  getBytesInUse?(keys: string | string[] | null, callback: (bytes: number) => void): void;
}

interface ChangeEvent<L> {
  addListener(listener: L): void;
  removeListener(listener: L): void;
  hasListener?(listener: L): boolean;
}

interface StorageNamespace {
  local?: CallbackArea;
  sync?: unknown;
  onChanged?: ChangeEvent<ChangeListener>;
}

const toLocalKey = (key: string): string => SYNC_FALLBACK_PREFIX + key;
const isFallbackKey = (key: string): boolean => key.startsWith(SYNC_FALLBACK_PREFIX);
const fromLocalKey = (key: string): string => key.slice(SYNC_FALLBACK_PREFIX.length);

export function isElectronRuntime(userAgent = globalThis.navigator?.userAgent ?? ''): boolean {
  return /\bElectron\//.test(userAgent);
}

/** Splits local changes into the plain local ones and the sync-fallback ones. */
export function splitFallbackChanges(changes: Changes): {
  local: Changes;
  sync: Changes;
} {
  const local: Changes = {};
  const sync: Changes = {};
  for (const [key, change] of Object.entries(changes)) {
    if (isFallbackKey(key)) sync[fromLocalKey(key)] = change;
    else local[key] = change;
  }
  return { local, sync };
}

function stripFallbackItems(items: Items | undefined): Items {
  const result: Items = {};
  for (const [key, value] of Object.entries(items ?? {})) {
    if (isFallbackKey(key)) result[fromLocalKey(key)] = value;
  }
  return result;
}

function toLocalKeys(keys: Keys): Keys {
  if (keys == null) return null;
  if (typeof keys === 'string') return toLocalKey(keys);
  if (Array.isArray(keys)) return keys.map(toLocalKey);
  return Object.fromEntries(Object.entries(keys).map(([key, value]) => [toLocalKey(key), value]));
}

function toLocalKeyList(keys: string | string[]): string[] {
  return (Array.isArray(keys) ? keys : [keys]).map(toLocalKey);
}

/** Calls `callback` when given, otherwise returns a promise (both MV3 forms). */
function settle<T>(
  run: (done: (value: T) => void) => void,
  callback?: (value: T) => void,
): Promise<T> | undefined {
  if (callback) {
    run(callback);
    return undefined;
  }
  return new Promise<T>((resolve, reject) => {
    run((value) => {
      const error = globalThis.chrome?.runtime?.lastError;
      if (error) reject(new Error(error.message));
      else resolve(value);
    });
  });
}

function createAreaOnChanged(storage: StorageNamespace): ChangeEvent<AreaChangeListener> {
  const wrappers = new Map<AreaChangeListener, ChangeListener>();
  return {
    addListener(listener) {
      if (wrappers.has(listener)) return;
      const wrapper: ChangeListener = (changes, areaName) => {
        if (areaName === 'sync') listener(changes);
      };
      wrappers.set(listener, wrapper);
      storage.onChanged?.addListener(wrapper);
    },
    removeListener(listener) {
      const wrapper = wrappers.get(listener);
      if (!wrapper) return;
      wrappers.delete(listener);
      storage.onChanged?.removeListener(wrapper);
    },
    hasListener: (listener) => wrappers.has(listener),
  };
}

export function createSyncFallbackArea(local: CallbackArea, storage: StorageNamespace) {
  const remove = (keys: string | string[], callback?: () => void) =>
    settle<void>((done) => local.remove(toLocalKeyList(keys), () => done()), callback);

  return {
    get(keys?: Keys, callback?: (items: Items) => void) {
      if (typeof keys === 'function') {
        callback = keys as (items: Items) => void;
        keys = null;
      }
      return settle<Items>(
        (done) => local.get(toLocalKeys(keys), (items) => done(stripFallbackItems(items))),
        callback,
      );
    },
    set(items: Items, callback?: () => void) {
      const mapped = Object.fromEntries(
        Object.entries(items).map(([key, value]) => [toLocalKey(key), value]),
      );
      return settle<void>((done) => local.set(mapped, () => done()), callback);
    },
    remove,
    clear(callback?: () => void) {
      return settle<void>(
        (done) =>
          local.get(null, (items) =>
            local.remove(Object.keys(items ?? {}).filter(isFallbackKey), () => done()),
          ),
        callback,
      );
    },
    getBytesInUse(keys?: string | string[] | null, callback?: (bytes: number) => void) {
      return settle<number>((done) => {
        if (!local.getBytesInUse) return done(0);
        const localKeys = keys == null ? null : toLocalKeyList(keys);
        local.getBytesInUse(localKeys, (bytes) => done(bytes ?? 0));
      }, callback);
    },
    onChanged: createAreaOnChanged(storage),
  };
}

/**
 * Rewrites `storage.onChanged` so sync-fallback writes reach listeners as
 * `'sync'` changes with their original keys, and never as `'local'` ones.
 */
function patchOnChanged(onChanged: ChangeEvent<ChangeListener>): void {
  const original = {
    addListener: onChanged.addListener.bind(onChanged),
    removeListener: onChanged.removeListener.bind(onChanged),
    hasListener: onChanged.hasListener?.bind(onChanged),
  };
  const wrappers = new Map<ChangeListener, ChangeListener>();

  const wrap =
    (listener: ChangeListener): ChangeListener =>
    (changes, areaName) => {
      if (areaName !== 'local') return listener(changes, areaName);
      const { local, sync } = splitFallbackChanges(changes);
      if (Object.keys(local).length > 0) listener(local, 'local');
      if (Object.keys(sync).length > 0) listener(sync, 'sync');
    };

  const methods: ChangeEvent<ChangeListener> = {
    addListener(listener) {
      if (wrappers.has(listener)) return;
      const wrapper = wrap(listener);
      wrappers.set(listener, wrapper);
      original.addListener(wrapper);
    },
    removeListener(listener) {
      const wrapper = wrappers.get(listener);
      if (!wrapper) return;
      wrappers.delete(listener);
      original.removeListener(wrapper);
    },
    hasListener: (listener) => wrappers.has(listener),
  };
  for (const [name, method] of Object.entries(methods)) {
    Object.defineProperty(onChanged, name, {
      value: method,
      configurable: true,
      writable: true,
    });
  }
}

/**
 * Installs the fallback on `chromeApi.storage` when running in Electron.
 * Returns whether it was installed.
 */
export function installStorageSyncFallback(
  chromeApi: { storage?: StorageNamespace } | undefined = globalThis.chrome as never,
  userAgent?: string,
): boolean {
  const storage = chromeApi?.storage;
  if (!storage?.local || !isElectronRuntime(userAgent)) return false;
  if ((storage.sync as { __nomadFallback?: boolean } | undefined)?.__nomadFallback) return true;

  try {
    const area = Object.assign(createSyncFallbackArea(storage.local, storage), {
      __nomadFallback: true,
    });
    if (storage.onChanged) patchOnChanged(storage.onChanged);
    Object.defineProperty(storage, 'sync', {
      value: area,
      configurable: true,
      writable: true,
    });
    return true;
  } catch (error) {
    console.warn('[Nomad] Could not install the chrome.storage.sync fallback:', error);
    return false;
  }
}

installStorageSyncFallback();
