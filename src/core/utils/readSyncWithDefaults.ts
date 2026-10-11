/**
 * Reads `chrome.storage.sync` with defaults and never rejects. When the read
 * fails (the API is missing, throws, or calls back with no result because
 * `runtime.lastError` is set) the defaults are returned instead.
 */
export function readSyncWithDefaults<T extends Record<string, unknown>>(
  defaults: T,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    try {
      const sync = chrome.storage?.sync;
      if (!sync) return resolve(defaults);
      sync.get(defaults, (items) => resolve(items ?? defaults));
    } catch {
      resolve(defaults);
    }
  });
}
