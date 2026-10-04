/* Manual ordering for the Prompt Manager list.
 *
 * The panel renders prompts in stored array order, so a reorder is a splice on
 * that array — no order field, no migration, and `mergePrompts` keeps the local
 * order when cloud data arrives.
 *
 * A move is expressed against a neighbour id instead of an index so it stays
 * correct while a tag filter or search hides part of the list: the dragged
 * prompt lands next to the row the user actually pointed at, and the hidden
 * prompts keep their relative order.
 */

export type DropPosition = 'before' | 'after';

export type DropPlacement = {
  targetId: string;
  position: DropPosition;
};

/** A rendered row, measured in any coordinate space `pointerY` shares. */
export type RowBox = {
  id: string;
  top: number;
  bottom: number;
};

/** Picks the gap nearest to `pointerY`: above the first row whose midpoint it has not passed. */
export function resolveDropPlacement(boxes: RowBox[], pointerY: number): DropPlacement | null {
  if (boxes.length === 0) return null;
  for (const box of boxes) {
    if (pointerY < (box.top + box.bottom) / 2) {
      return { targetId: box.id, position: 'before' };
    }
  }
  return { targetId: boxes[boxes.length - 1].id, position: 'after' };
}

/**
 * Moves `draggedId` next to the placement target.
 *
 * Returns the original array when the move would change nothing, so callers can
 * skip the storage write and suppress the drop indicator with one check.
 */
export function movePromptItem<T extends { id: string }>(
  items: T[],
  draggedId: string,
  placement: DropPlacement | null,
): T[] {
  if (!placement || placement.targetId === draggedId) return items;
  const from = items.findIndex((item) => item.id === draggedId);
  if (from < 0) return items;
  if (!items.some((item) => item.id === placement.targetId)) return items;

  const next = items.slice();
  const [moved] = next.splice(from, 1);
  const anchor = next.findIndex((item) => item.id === placement.targetId);
  const to = placement.position === 'before' ? anchor : anchor + 1;
  if (to === from) return items;
  next.splice(to, 0, moved);
  return next;
}

/** Keyboard equivalent of a drag: one step up or down through the rows the user can see. */
export function stepPlacement(
  visibleIds: string[],
  draggedId: string,
  direction: -1 | 1,
): DropPlacement | null {
  const index = visibleIds.indexOf(draggedId);
  if (index < 0) return null;
  const neighbor = index + direction;
  if (neighbor < 0 || neighbor >= visibleIds.length) return null;
  return { targetId: visibleIds[neighbor], position: direction < 0 ? 'before' : 'after' };
}
