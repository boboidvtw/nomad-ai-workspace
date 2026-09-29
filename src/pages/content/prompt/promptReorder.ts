/* Drag and keyboard reordering for the Prompt Manager list.
 *
 * Owns one gesture at a time: the pointer session, the drop indicator, the
 * edge auto-scroll frame and the window listeners that outlive a single row.
 * The panel keeps ownership of the prompt array — this module only reads the
 * current order and hands back a reordered one.
 *
 * The gesture starts from the row's own handle, never the row: the prompt body
 * activates on mousedown and the panel itself drags from `.gv-pm-drag`, so a
 * whole-row drag would collide with both.
 */

import {
  type DropPlacement,
  movePromptItem,
  resolveDropPlacement,
  stepPlacement,
} from './reorderPrompts';

const THRESHOLD_PX = 4;
const EDGE_ZONE_PX = 28;
const MAX_STEP_PX = 14;
const ROW_SELECTOR = '.gv-pm-item[data-gv-prompt-id]';
const HANDLE_SELECTOR = '.gv-pm-reorder';

export type PromptReorderDeps<T extends { id: string }> = {
  /** The scrolling list the rows live in. */
  list: HTMLElement;
  /** The order the panel currently holds. */
  getItems: () => T[];
  /** Receives the reordered array; the panel repaints and persists it. */
  commit: (items: T[]) => void;
  /** Fires once a drag passes the threshold, so hover previews can close. */
  onDragStart?: () => void;
  /**
   * Optional grouping. A drop may only land among rows of the same group, so a
   * pinned prompt cannot be dragged out of the pinned block — pinning owns that
   * move, dragging only orders within a block.
   */
  groupOf?: (id: string) => string;
  /**
   * Whole-row mode only: a press that never travelled. The row's primary
   * action moves here from mousedown, which is what lets the row itself take
   * the drag without stealing the click.
   */
  onTap?: (id: string) => void;
};

export type PromptReorderController = {
  /** Wires one rendered row and its handle. Rebuilt rows are simply rebound. */
  bind: (row: HTMLElement, handle: HTMLElement, id: string) => void;
  /** Wires a row that drags from anywhere except its own buttons. */
  bindRow: (row: HTMLElement, id: string) => void;
  destroy: () => void;
};

type Session = {
  pointerId: number;
  id: string;
  row: HTMLElement;
  handle: HTMLElement;
  startY: number;
  pointerY: number;
  /** Set once the pointer passes the threshold, so a plain click is not a move. */
  active: boolean;
  /** Whole-row gestures fall back to the row's primary action when they stall. */
  fromRow: boolean;
  placement: DropPlacement | null;
  autoScrollFrame: number | null;
};

export function createPromptReorder<T extends { id: string }>(
  deps: PromptReorderDeps<T>,
): PromptReorderController {
  const { list, getItems, commit } = deps;
  let session: Session | null = null;

  function rows(): HTMLElement[] {
    return Array.from(list.querySelectorAll<HTMLElement>(ROW_SELECTOR));
  }

  /** The rows a drag starting on `id` is allowed to land among. */
  function rowsInGroup(id: string): HTMLElement[] {
    const all = rows();
    if (!deps.groupOf) return all;
    const group = deps.groupOf(id);
    return all.filter((row) => deps.groupOf?.(row.dataset.gvPromptId || '') === group);
  }

  function paintIndicator(placement: DropPlacement | null): void {
    for (const row of rows()) {
      const position =
        placement && row.dataset.gvPromptId === placement.targetId ? placement.position : null;
      if (position) row.setAttribute('data-gv-drop', position);
      else row.removeAttribute('data-gv-drop');
    }
  }

  function apply(id: string, placement: DropPlacement | null): boolean {
    const items = getItems();
    const next = movePromptItem(items, id, placement);
    if (next === items) return false;
    commit(next);
    return true;
  }

  /** Measures rows in list content coordinates so auto-scrolling cannot shift the drop target. */
  function placementForPointer(current: Session): DropPlacement | null {
    const listRect = list.getBoundingClientRect();
    const boxes = rowsInGroup(current.id).map((row) => {
      const rect = row.getBoundingClientRect();
      return {
        id: row.dataset.gvPromptId || '',
        top: rect.top - listRect.top + list.scrollTop,
        bottom: rect.bottom - listRect.top + list.scrollTop,
      };
    });
    const placement = resolveDropPlacement(boxes, current.pointerY - listRect.top + list.scrollTop);
    // A placement that would not move anything must not paint a drop line.
    return movePromptItem(getItems(), current.id, placement) === getItems() ? null : placement;
  }

  function autoScrollStep(): void {
    const current = session;
    if (!current) return;
    const rect = list.getBoundingClientRect();
    const fromTop = current.pointerY - rect.top;
    const fromBottom = rect.bottom - current.pointerY;
    const speed = (distance: number) =>
      Math.ceil(((EDGE_ZONE_PX - Math.max(distance, 0)) / EDGE_ZONE_PX) * MAX_STEP_PX);
    let delta = 0;
    if (fromTop < EDGE_ZONE_PX) delta = -speed(fromTop);
    else if (fromBottom < EDGE_ZONE_PX) delta = speed(fromBottom);
    if (delta !== 0) {
      const before = list.scrollTop;
      list.scrollTop = before + delta;
      if (list.scrollTop !== before) {
        current.placement = placementForPointer(current);
        paintIndicator(current.placement);
      }
    }
    current.autoScrollFrame = requestAnimationFrame(autoScrollStep);
  }

  function onPointerMove(ev: PointerEvent): void {
    const current = session;
    if (!current || ev.pointerId !== current.pointerId) return;
    current.pointerY = ev.clientY;
    if (!current.active) {
      if (Math.abs(ev.clientY - current.startY) < THRESHOLD_PX) return;
      current.active = true;
      deps.onDragStart?.();
      current.row.classList.add('gv-pm-item-dragging');
      list.classList.add('gv-pm-list-reordering');
      current.autoScrollFrame = requestAnimationFrame(autoScrollStep);
    }
    current.placement = placementForPointer(current);
    paintIndicator(current.placement);
  }

  function end(shouldCommit: boolean): void {
    const current = session;
    if (!current) return;
    session = null;
    if (current.autoScrollFrame !== null) cancelAnimationFrame(current.autoScrollFrame);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('keydown', onSessionKeyDown, true);
    try {
      current.handle.releasePointerCapture?.(current.pointerId);
    } catch {}
    current.row.classList.remove('gv-pm-item-dragging');
    list.classList.remove('gv-pm-list-reordering');
    paintIndicator(null);
    if (!shouldCommit) return;
    if (current.active) apply(current.id, current.placement);
    else if (current.fromRow) deps.onTap?.(current.id);
  }

  function onPointerUp(ev: PointerEvent): void {
    if (session && ev.pointerId !== session.pointerId) return;
    end(true);
  }

  function onPointerCancel(ev: PointerEvent): void {
    if (session && ev.pointerId !== session.pointerId) return;
    end(false);
  }

  function onSessionKeyDown(ev: KeyboardEvent): void {
    if (ev.key !== 'Escape') return;
    // Capture phase: a cancelled drag must not also close the panel.
    ev.preventDefault();
    ev.stopPropagation();
    end(false);
  }

  function begin(
    ev: PointerEvent,
    row: HTMLElement,
    handle: HTMLElement,
    id: string,
    fromRow = false,
  ): void {
    if (ev.button !== 0) return;
    // Keep the press away from the panel drag handler, focus and text selection.
    ev.preventDefault();
    ev.stopPropagation();
    end(false);
    session = {
      pointerId: ev.pointerId,
      id,
      row,
      handle,
      startY: ev.clientY,
      pointerY: ev.clientY,
      active: false,
      fromRow,
      placement: null,
      autoScrollFrame: null,
    };
    try {
      handle.setPointerCapture?.(ev.pointerId);
    } catch {}
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerCancel, { passive: true });
    window.addEventListener('keydown', onSessionKeyDown, true);
  }

  /** Keeps the moved row focused and in view after the list is rebuilt. */
  function refocus(id: string): void {
    for (const row of rows()) {
      if (row.dataset.gvPromptId !== id) continue;
      row.querySelector<HTMLElement>(HANDLE_SELECTOR)?.focus({ preventScroll: true });
      // Scroll the list itself; scrollIntoView would be free to move the page
      // behind the panel.
      const rowRect = row.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      if (rowRect.top < listRect.top) list.scrollTop -= listRect.top - rowRect.top;
      else if (rowRect.bottom > listRect.bottom) list.scrollTop += rowRect.bottom - listRect.bottom;
      return;
    }
  }

  function placementForStep(id: string, direction: -1 | 1): DropPlacement | null {
    return stepPlacement(
      rowsInGroup(id).map((row) => row.dataset.gvPromptId || ''),
      id,
      direction,
    );
  }

  function onHandleKeyDown(ev: KeyboardEvent, id: string): void {
    const direction = ev.key === 'ArrowUp' ? -1 : ev.key === 'ArrowDown' ? 1 : 0;
    if (direction === 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (apply(id, placementForStep(id, direction))) refocus(id);
  }

  return {
    bind: (row, handle, id) => {
      row.dataset.gvPromptId = id;
      handle.addEventListener('pointerdown', (ev) => begin(ev, row, handle, id));
      handle.addEventListener('keydown', (ev) => onHandleKeyDown(ev, id));
      handle.addEventListener('click', (ev) => ev.stopPropagation());
    },
    bindRow: (row, id) => {
      row.dataset.gvPromptId = id;
      row.addEventListener('pointerdown', (ev) => {
        // Anything that is already a control keeps its own click.
        if ((ev.target as HTMLElement | null)?.closest('button, a, input, textarea')) return;
        begin(ev, row, row, id, true);
      });
    },
    destroy: () => end(false),
  };
}
