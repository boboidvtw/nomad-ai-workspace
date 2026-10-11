import { afterEach, describe, expect, it, vi } from 'vitest';

import { readSyncWithDefaults } from '../readSyncWithDefaults';

const syncGet = chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>;
const defaults = { gvHighlightDefaultColor: 'yellow', gvQuoteReplyEnabled: true };

describe('readSyncWithDefaults', () => {
  afterEach(() => syncGet.mockReset());

  it('returns the stored values', async () => {
    syncGet.mockImplementation((_keys, callback) =>
      callback({ ...defaults, gvHighlightDefaultColor: 'blue' }),
    );
    expect(await readSyncWithDefaults(defaults)).toEqual({
      gvHighlightDefaultColor: 'blue',
      gvQuoteReplyEnabled: true,
    });
    expect(syncGet).toHaveBeenCalledWith(defaults, expect.any(Function));
  });

  it('returns the defaults when the callback gets no result', async () => {
    syncGet.mockImplementation((_keys, callback) => callback(undefined));
    expect(await readSyncWithDefaults(defaults)).toEqual(defaults);
  });

  it('returns the defaults when the call throws', async () => {
    syncGet.mockImplementation(() => {
      throw new Error('"sync" is not available in this instance of Chrome');
    });
    expect(await readSyncWithDefaults(defaults)).toEqual(defaults);
  });
});
