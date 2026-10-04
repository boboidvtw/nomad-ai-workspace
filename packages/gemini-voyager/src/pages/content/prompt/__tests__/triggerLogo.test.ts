import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { StorageKeys } from '../../../../core/types/common';
import {
  DEFAULT_TRIGGER_LOGO,
  MASCOT_TRIGGER_LOGO,
  TRIGGER_MASCOT_CLASS,
  applyTriggerLogo,
  applyTriggerLogoFromStorageChange,
  createTriggerLogoImage,
  isMascotLogoEnabled,
  mascotLogoFromRecord,
  triggerLogoPath,
} from '../triggerLogo';

function webAccessibleResources(manifestPath: string): string[] {
  const manifest = JSON.parse(readFileSync(resolve(process.cwd(), manifestPath), 'utf8')) as {
    web_accessible_resources?: Array<{ resources?: string[] }>;
  };
  return manifest.web_accessible_resources?.flatMap((entry) => entry.resources ?? []) ?? [];
}

describe('triggerLogo', () => {
  it('treats only a real boolean true as the mascot preference', () => {
    expect(isMascotLogoEnabled(true)).toBe(true);
    expect(isMascotLogoEnabled(false)).toBe(false);
    expect(isMascotLogoEnabled(1)).toBe(false);
    expect(isMascotLogoEnabled('true')).toBe(false);
    expect(isMascotLogoEnabled(undefined)).toBe(false);
  });

  it('points the floating ball at the cut-out mascot or the default mark', () => {
    expect(triggerLogoPath(true)).toBe(MASCOT_TRIGGER_LOGO);
    expect(triggerLogoPath(false)).toBe(DEFAULT_TRIGGER_LOGO);
  });

  it('swaps the image and mascot class without rewriting an already-current src', () => {
    const trigger = document.createElement('button');
    const img = document.createElement('img');
    const urls: string[] = [];
    const getUrl = (path: string) => {
      urls.push(path);
      return `chrome-extension://id/${path}`;
    };

    applyTriggerLogo(trigger, img, true, getUrl);
    expect(trigger.classList.contains(TRIGGER_MASCOT_CLASS)).toBe(true);
    expect(img.width).toBe(46);
    expect(img.height).toBe(46);
    expect(img.src).toBe(`chrome-extension://id/${MASCOT_TRIGGER_LOGO}`);

    applyTriggerLogo(trigger, img, true, getUrl);
    expect(urls).toEqual([MASCOT_TRIGGER_LOGO, MASCOT_TRIGGER_LOGO]);

    applyTriggerLogo(trigger, img, false, getUrl);
    expect(trigger.classList.contains(TRIGGER_MASCOT_CLASS)).toBe(false);
    expect(img.width).toBe(24);
    expect(img.height).toBe(24);
    expect(img.src).toBe(`chrome-extension://id/${DEFAULT_TRIGGER_LOGO}`);
  });

  it('mounts the trigger image and falls back to the default mark on error', () => {
    const trigger = document.createElement('button');
    const img = createTriggerLogoImage(trigger, true, (path) => `chrome-extension://id/${path}`);
    expect(trigger.contains(img)).toBe(true);
    expect(img.alt).toBe('pm');
    expect(img.src).toBe(`chrome-extension://id/${MASCOT_TRIGGER_LOGO}`);
    img.dispatchEvent(new Event('error'));
    expect(img.src).toBe(`chrome-extension://id/${DEFAULT_TRIGGER_LOGO}`);
  });

  it('reads only the mascot storage key and ignores changes from other areas', () => {
    expect(mascotLogoFromRecord({ [StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO]: true })).toBe(true);
    expect(mascotLogoFromRecord({})).toBe(false);

    const trigger = document.createElement('button');
    const img = document.createElement('img');
    const getUrl = (path: string) => `chrome-extension://id/${path}`;
    applyTriggerLogoFromStorageChange(
      'local',
      { [StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO]: { newValue: true } },
      trigger,
      img,
      getUrl,
    );
    expect(trigger.classList.contains(TRIGGER_MASCOT_CLASS)).toBe(false);

    applyTriggerLogoFromStorageChange(
      'sync',
      { [StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO]: { newValue: true } },
      trigger,
      img,
      getUrl,
    );
    expect(trigger.classList.contains(TRIGGER_MASCOT_CLASS)).toBe(true);
    expect(img.src).toBe(`chrome-extension://id/${MASCOT_TRIGGER_LOGO}`);
  });

  it('exposes the cut-out mascot to pages that host the floating ball', () => {
    expect(webAccessibleResources('manifest.json')).toContain(MASCOT_TRIGGER_LOGO);
    expect(webAccessibleResources('manifest.dev.json')).toContain(MASCOT_TRIGGER_LOGO);
  });
});
