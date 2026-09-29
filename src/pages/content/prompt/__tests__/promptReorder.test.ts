import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPromptReorder } from '../promptReorder';

type Item = { id: string };

const ROW_HEIGHT = 40;

/** jsdom lays nothing out, so rows are measured through explicit stubs. */
function setRect(el: HTMLElement, top: number, bottom: number): void {
  el.getBoundingClientRect = () =>
    ({
      top,
      bottom,
      left: 0,
      right: 200,
      width: 200,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}

/** jsdom has no PointerEvent constructor; MouseEvent carries what the module reads. */
function pointerEvent(type: string, clientY: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientY, button: 0 });
}

let teardown: (() => void) | null = null;

function mount(ids: string[], options: { bindRow?: boolean } = {}) {
  const list = document.createElement('div');
  list.className = 'gv-pm-list';
  setRect(list, 0, ids.length * ROW_HEIGHT);
  document.body.appendChild(list);

  let items: Item[] = ids.map((id) => ({ id }));
  const commit = vi.fn((next: Item[]) => {
    items = next;
  });
  const onDragStart = vi.fn();
  const onTap = vi.fn();
  const controller = createPromptReorder<Item>({
    list,
    getItems: () => items,
    commit,
    onDragStart,
    onTap,
  });

  const rows = new Map<string, HTMLElement>();
  const handles = new Map<string, HTMLElement>();
  ids.forEach((id, index) => {
    const row = document.createElement('div');
    row.className = 'gv-pm-item';
    setRect(row, index * ROW_HEIGHT, index * ROW_HEIGHT + ROW_HEIGHT);
    const handle = document.createElement('button');
    handle.className = 'gv-pm-reorder';
    row.appendChild(handle);
    list.appendChild(row);
    if (options.bindRow) controller.bindRow(row, id);
    else controller.bind(row, handle, id);
    rows.set(id, row);
    handles.set(id, handle);
  });

  teardown = () => {
    controller.destroy();
    list.remove();
  };

  const drag = (id: string, from: number, to: number) => {
    handles.get(id)!.dispatchEvent(pointerEvent('pointerdown', from));
    window.dispatchEvent(pointerEvent('pointermove', to));
  };

  return {
    commit,
    controller,
    drag,
    handles,
    onDragStart,
    onTap,
    order: () => items.map((it) => it.id),
    rows,
  };
}

afterEach(() => {
  teardown?.();
  teardown = null;
  document.body.innerHTML = '';
});

describe('prompt reorder gesture', () => {
  it('drops a prompt into the gap the pointer last crossed', () => {
    const panel = mount(['a', 'b', 'c']);

    panel.drag('c', 100, 10);
    window.dispatchEvent(pointerEvent('pointerup', 10));

    expect(panel.commit).toHaveBeenCalledTimes(1);
    expect(panel.order()).toEqual(['c', 'a', 'b']);
  });

  it('marks the dragged row and the target gap while the drag is live', () => {
    const panel = mount(['a', 'b', 'c']);

    panel.drag('c', 100, 10);

    expect(panel.onDragStart).toHaveBeenCalledTimes(1);
    expect(panel.rows.get('c')!.classList.contains('gv-pm-item-dragging')).toBe(true);
    expect(panel.rows.get('a')!.getAttribute('data-gv-drop')).toBe('before');

    window.dispatchEvent(pointerEvent('pointerup', 10));

    expect(panel.rows.get('c')!.classList.contains('gv-pm-item-dragging')).toBe(false);
    expect(panel.rows.get('a')!.hasAttribute('data-gv-drop')).toBe(false);
  });

  it('treats a press that never travels as a click, not a move', () => {
    const panel = mount(['a', 'b', 'c']);

    panel.drag('c', 100, 102);
    window.dispatchEvent(pointerEvent('pointerup', 102));

    expect(panel.commit).not.toHaveBeenCalled();
    expect(panel.order()).toEqual(['a', 'b', 'c']);
  });

  it('cancels the drag on Escape and keeps the stored order', () => {
    const panel = mount(['a', 'b', 'c']);

    panel.drag('c', 100, 10);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.dispatchEvent(pointerEvent('pointerup', 10));

    expect(panel.commit).not.toHaveBeenCalled();
    expect(panel.rows.get('c')!.classList.contains('gv-pm-item-dragging')).toBe(false);
  });

  it('drops the gesture when the panel is torn down mid-drag', () => {
    const panel = mount(['a', 'b', 'c']);

    panel.drag('c', 100, 10);
    panel.controller.destroy();
    window.dispatchEvent(pointerEvent('pointerup', 10));

    expect(panel.commit).not.toHaveBeenCalled();
  });

  it('moves one step per arrow key and keeps the handle focused', () => {
    const panel = mount(['a', 'b', 'c']);
    const handle = panel.handles.get('c')!;

    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));

    expect(panel.order()).toEqual(['a', 'c', 'b']);
    expect(document.activeElement).toBe(handle);
  });

  it('reports a tap when a whole-row press never travelled', () => {
    const panel = mount(['a', 'b', 'c'], { bindRow: true });

    panel.rows.get('b')!.dispatchEvent(pointerEvent('pointerdown', 60));
    window.dispatchEvent(pointerEvent('pointerup', 60));

    expect(panel.onTap).toHaveBeenCalledWith('b');
    expect(panel.commit).not.toHaveBeenCalled();
  });

  it('treats a whole-row press that travelled as a move, not a tap', () => {
    const panel = mount(['a', 'b', 'c'], { bindRow: true });

    panel.rows.get('c')!.dispatchEvent(pointerEvent('pointerdown', 100));
    window.dispatchEvent(pointerEvent('pointermove', 10));
    window.dispatchEvent(pointerEvent('pointerup', 10));

    expect(panel.order()).toEqual(['c', 'a', 'b']);
    expect(panel.onTap).not.toHaveBeenCalled();
  });

  it('leaves buttons inside the row to their own click', () => {
    const panel = mount(['a', 'b', 'c'], { bindRow: true });
    const row = panel.rows.get('b')!;
    const button = document.createElement('button');
    row.appendChild(button);

    button.dispatchEvent(pointerEvent('pointerdown', 60));
    window.dispatchEvent(pointerEvent('pointerup', 60));

    expect(panel.onTap).not.toHaveBeenCalled();
    expect(panel.commit).not.toHaveBeenCalled();
  });

  it('stops arrow moves at the ends of the list', () => {
    const panel = mount(['a', 'b', 'c']);

    panel.handles.get('a')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    panel.handles.get('c')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));

    expect(panel.commit).not.toHaveBeenCalled();
  });
});
