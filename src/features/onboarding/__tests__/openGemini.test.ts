import { beforeEach, describe, expect, it, vi } from 'vitest';

const polyfill = vi.hoisted(() => ({
  tabs: { query: vi.fn(), update: vi.fn(), reload: vi.fn(), create: vi.fn() },
  windows: { update: vi.fn() },
}));

vi.mock('webextension-polyfill', () => ({ default: polyfill }));

import { GEMINI_APP_URL, focusOrOpenGemini } from '../openGemini';

describe('focusOrOpenGemini', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    polyfill.tabs.update.mockResolvedValue({});
    polyfill.tabs.reload.mockResolvedValue(undefined);
    polyfill.tabs.create.mockResolvedValue({});
    polyfill.windows.update.mockResolvedValue({});
  });

  it('focuses and reloads a Gemini tab that predates the install', async () => {
    polyfill.tabs.query.mockResolvedValue([{ id: 7, windowId: 3 }]);
    await focusOrOpenGemini();
    expect(polyfill.tabs.update).toHaveBeenCalledWith(7, { active: true });
    expect(polyfill.windows.update).toHaveBeenCalledWith(3, { focused: true });
    expect(polyfill.tabs.reload).toHaveBeenCalledWith(7);
    expect(polyfill.tabs.create).not.toHaveBeenCalled();
  });

  it('opens a new Gemini tab when none is open', async () => {
    polyfill.tabs.query.mockResolvedValue([]);
    await focusOrOpenGemini();
    expect(polyfill.tabs.create).toHaveBeenCalledWith({ url: GEMINI_APP_URL });
  });

  it('falls back to a new tab when the browser refuses the URL query', async () => {
    polyfill.tabs.query.mockRejectedValue(new Error('denied'));
    await focusOrOpenGemini();
    expect(polyfill.tabs.create).toHaveBeenCalledWith({ url: GEMINI_APP_URL });
  });
});
