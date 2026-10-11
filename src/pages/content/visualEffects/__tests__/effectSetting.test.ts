import { describe, expect, it } from 'vitest';

import { resolveVisualEffect } from '../effectSetting';

describe('resolveVisualEffect', () => {
  it('returns the stored effect name', () => {
    expect(resolveVisualEffect({ gvVisualEffect: 'rain', gvSnowEffect: false })).toBe('rain');
  });

  it('maps the legacy snow boolean to snow', () => {
    expect(resolveVisualEffect({ gvVisualEffect: null, gvSnowEffect: true })).toBe('snow');
  });

  it("falls back to 'off' for missing or unreadable results", () => {
    expect(resolveVisualEffect({})).toBe('off');
    // storage.sync.get passes undefined to its callback when the read fails.
    expect(resolveVisualEffect(undefined)).toBe('off');
  });
});
