import { StorageKeys } from '../../../core/types/common';

export const DEFAULT_TRIGGER_LOGO = 'icon-32.png';
export const MASCOT_TRIGGER_LOGO = 'mascot-logo.png';
export const TRIGGER_MASCOT_CLASS = 'gv-pm-trigger--mascot';

export function isMascotLogoEnabled(value: unknown): boolean {
  return value === true;
}

export function triggerLogoPath(useMascot: boolean): string {
  return useMascot ? MASCOT_TRIGGER_LOGO : DEFAULT_TRIGGER_LOGO;
}

export function mascotLogoFromRecord(raw: Record<string, unknown> | undefined): boolean {
  return isMascotLogoEnabled(raw?.[StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO]);
}

export function applyTriggerLogo(
  trigger: HTMLElement,
  img: HTMLImageElement,
  useMascot: boolean,
  getUrl: (path: string) => string,
): void {
  trigger.classList.toggle(TRIGGER_MASCOT_CLASS, useMascot);
  img.width = useMascot ? 46 : 24;
  img.height = useMascot ? 46 : 24;
  const next = getUrl(triggerLogoPath(useMascot));
  if (img.src !== next) img.src = next;
}

export function createTriggerLogoImage(
  trigger: HTMLElement,
  useMascot: boolean,
  getUrl: (path: string) => string,
): HTMLImageElement {
  const img = document.createElement('img');
  img.alt = 'pm';
  applyTriggerLogo(trigger, img, useMascot, getUrl);
  img.addEventListener(
    'error',
    () => {
      const fallback = getUrl(DEFAULT_TRIGGER_LOGO);
      if (img.src !== fallback) img.src = fallback;
    },
    { once: true },
  );
  trigger.appendChild(img);
  return img;
}

export function applyTriggerLogoFromStorageChange(
  area: string,
  changes: Record<string, { newValue?: unknown }>,
  trigger: HTMLElement,
  img: HTMLImageElement,
  getUrl: (path: string) => string,
): void {
  if (area !== 'sync' || !Object.hasOwn(changes, StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO)) return;
  applyTriggerLogo(
    trigger,
    img,
    isMascotLogoEnabled(changes[StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO]?.newValue),
    getUrl,
  );
}
