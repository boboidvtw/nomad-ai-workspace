import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPromptRowSurfaces } from '../promptRowConfirm';

let surfaces: ReturnType<typeof createPromptRowSurfaces> | null = null;

function mount() {
  surfaces = createPromptRowSurfaces();
  const anchor = document.createElement('button');
  anchor.textContent = 'Delete';
  document.body.appendChild(anchor);
  return { surfaces, anchor };
}

afterEach(() => {
  surfaces?.destroy();
  surfaces = null;
  document.body.innerHTML = '';
});

describe('prompt row delete confirmation', () => {
  it('closes on Escape, on an outside press, and on a scroll underneath', () => {
    const { surfaces, anchor } = mount();
    const request = {
      anchor,
      message: '删除这条提示词？',
      confirmLabel: '删除',
      cancelLabel: '取消',
      onConfirm: () => {},
    };

    surfaces.openConfirm(request);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(surfaces.isOpen()).toBe(false);

    surfaces.openConfirm(request);
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(surfaces.isOpen()).toBe(false);

    surfaces.openConfirm(request);
    window.dispatchEvent(new Event('scroll'));
    expect(surfaces.isOpen()).toBe(false);
  });

  it('keeps a press inside the popover from dismissing it', () => {
    const { surfaces, anchor } = mount();
    surfaces.openConfirm({
      anchor,
      message: '删除这条提示词？',
      confirmLabel: '删除',
      cancelLabel: '取消',
      onConfirm: () => {},
    });

    document
      .querySelector('.gv-pm-confirm')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(surfaces.isOpen()).toBe(true);
  });

  it('replaces the popover instead of stacking a second one', () => {
    const { surfaces, anchor } = mount();
    const request = {
      anchor,
      message: '删除这条提示词？',
      confirmLabel: '删除',
      cancelLabel: '取消',
      onConfirm: () => {},
    };

    surfaces.openConfirm(request);
    surfaces.openConfirm(request);

    expect(document.querySelectorAll('.gv-pm-confirm')).toHaveLength(1);
  });

  it('confirms only on the confirm button and returns focus to the anchor', () => {
    const { surfaces, anchor } = mount();
    const onConfirm = vi.fn();
    const request = {
      anchor,
      message: '删除这条提示词？',
      confirmLabel: '删除',
      cancelLabel: '取消',
      onConfirm,
    };

    surfaces.openConfirm(request);
    document.querySelector<HTMLButtonElement>('.gv-pm-confirm button:last-child')!.click();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(anchor);

    surfaces.openConfirm(request);
    document.querySelector<HTMLButtonElement>('.gv-pm-confirm-yes')!.click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(surfaces.isOpen()).toBe(false);
  });
});
