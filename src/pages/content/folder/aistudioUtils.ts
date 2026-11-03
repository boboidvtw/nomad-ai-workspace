/** Small DOM and id helpers shared by the AI Studio folder modules. */

export function waitForElement<T extends Element = Element>(
  selector: string,
  timeoutMs = 10000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const found = document.querySelector(selector) as T | null;
    if (found) return resolve(found);
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector) as T | null;
      if (el) {
        try {
          obs.disconnect();
        } catch {}
        resolve(el);
      }
    });
    try {
      obs.observe(document.body, { childList: true, subtree: true });
    } catch {}
    if (timeoutMs > 0) {
      setTimeout(() => {
        try {
          obs.disconnect();
        } catch {}
        resolve(null);
      }, timeoutMs);
    }
  });
}

export function normalizeText(text: string | null | undefined): string {
  try {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

export function downloadJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch {}
    URL.revokeObjectURL(url);
  }, 0);
}

export function now(): number {
  return Date.now();
}

export function uid(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/** Validate folder data structure */
export function validateFolderData(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.folders) && typeof d.folderContents === 'object';
}
