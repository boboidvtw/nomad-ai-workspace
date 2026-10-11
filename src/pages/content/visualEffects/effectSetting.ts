export const VISUAL_EFFECT_KEY = 'gvVisualEffect';
/** Pre-`gvVisualEffect` boolean that only knew about snow. */
export const LEGACY_SNOW_KEY = 'gvSnowEffect';

/**
 * Resolves the stored visual effect from a `storage.sync.get` result. The
 * result is undefined when the read failed (e.g. `runtime.lastError`), which
 * falls back to 'off' instead of throwing in the callback.
 */
export function resolveVisualEffect(result: Record<string, unknown> | undefined): string {
  const effect = result?.[VISUAL_EFFECT_KEY];
  if (typeof effect === 'string') return effect;
  // Backward compat: old boolean snow key -> 'snow'
  if (result?.[LEGACY_SNOW_KEY] === true) return 'snow';
  return 'off';
}
