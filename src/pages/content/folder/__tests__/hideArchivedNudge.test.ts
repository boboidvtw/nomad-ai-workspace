import { afterEach, describe, expect, it, vi } from 'vitest';

import { NUDGE_CLASS, mountHideArchivedNudge } from '../hideArchivedNudge';

vi.mock('@/utils/i18n', () => ({
  getTranslationSyncUnsafe: (key: string) => key,
}));

function mount(container: HTMLElement): void {
  mountHideArchivedNudge({
    container,
    onEnable: () => {},
    onDismiss: () => {},
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('mountHideArchivedNudge', () => {
  it('inserts the card right after a header that is a direct child', () => {
    const container = document.createElement('div');
    container.innerHTML = '<div class="gv-folder-header"></div><div class="list"></div>';
    document.body.appendChild(container);

    mount(container);

    expect(container.children[1].classList.contains(NUDGE_CLASS)).toBe(true);
  });

  it('inserts the card after a header nested inside a wrapper', () => {
    // The live panel wraps the folder header in the workspace body, so the header
    // is a descendant, not a direct child, of the mount container.
    const container = document.createElement('div');
    container.innerHTML =
      '<div class="nomad-workspace-body"><div class="gv-folder-header"></div><div class="list"></div></div>';
    document.body.appendChild(container);

    expect(() => mount(container)).not.toThrow();

    const header = container.querySelector('.gv-folder-header')!;
    expect(header.nextElementSibling?.classList.contains(NUDGE_CLASS)).toBe(true);
  });

  it('appends the card when the container has no header', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    mount(container);

    expect(container.lastElementChild?.classList.contains(NUDGE_CLASS)).toBe(true);
  });
});
