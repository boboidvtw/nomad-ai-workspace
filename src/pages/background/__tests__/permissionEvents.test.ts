import { describe, expect, it, vi } from 'vitest';

import { addPermissionChangeListeners } from '../permissionEvents';

const handlers = () => ({ onAdded: vi.fn(), onRemoved: vi.fn() });

describe('addPermissionChangeListeners', () => {
  it('registers both listeners when chrome.permissions events exist', () => {
    const api = {
      onAdded: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    };
    const h = handlers();

    const registered = addPermissionChangeListeners(h, api as never);

    expect(registered).toBe(true);
    expect(api.onAdded.addListener).toHaveBeenCalledWith(h.onAdded);
    expect(api.onRemoved.addListener).toHaveBeenCalledWith(h.onRemoved);
  });

  it('does not throw when chrome.permissions is missing (Electron)', () => {
    expect(() => addPermissionChangeListeners(handlers(), undefined)).not.toThrow();
    expect(addPermissionChangeListeners(handlers(), undefined)).toBe(false);
  });

  it('registers whichever event exists when the API is partial', () => {
    const api = { onRemoved: { addListener: vi.fn() } };
    const h = handlers();

    expect(addPermissionChangeListeners(h, api as never)).toBe(false);
    expect(api.onRemoved.addListener).toHaveBeenCalledWith(h.onRemoved);
  });
});
