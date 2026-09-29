import { describe, expect, it } from 'vitest';

import {
  type RowBox,
  movePromptItem,
  resolveDropPlacement,
  stepPlacement,
} from '../reorderPrompts';

const item = (id: string) => ({ id });
const ids = (items: Array<{ id: string }>) => items.map((entry) => entry.id);

const boxes: RowBox[] = [
  { id: 'a', top: 0, bottom: 40 },
  { id: 'b', top: 40, bottom: 80 },
  { id: 'c', top: 80, bottom: 120 },
];

describe('resolveDropPlacement', () => {
  it('drops before a row while the pointer is above its midpoint', () => {
    expect(resolveDropPlacement(boxes, 55)).toEqual({ targetId: 'b', position: 'before' });
  });

  it('drops before the first row above the list', () => {
    expect(resolveDropPlacement(boxes, -30)).toEqual({ targetId: 'a', position: 'before' });
  });

  it('drops after the last row below the list', () => {
    expect(resolveDropPlacement(boxes, 400)).toEqual({ targetId: 'c', position: 'after' });
  });

  it('has no placement without rows', () => {
    expect(resolveDropPlacement([], 10)).toBeNull();
  });
});

describe('movePromptItem', () => {
  const items = [item('a'), item('b'), item('c'), item('d')];

  it('moves a prompt up', () => {
    expect(ids(movePromptItem(items, 'c', { targetId: 'a', position: 'before' }))).toEqual([
      'c',
      'a',
      'b',
      'd',
    ]);
  });

  it('moves a prompt down', () => {
    expect(ids(movePromptItem(items, 'a', { targetId: 'c', position: 'after' }))).toEqual([
      'b',
      'c',
      'a',
      'd',
    ]);
  });

  it('leaves the input untouched when the prompt already sits there', () => {
    expect(movePromptItem(items, 'b', { targetId: 'a', position: 'after' })).toBe(items);
    expect(movePromptItem(items, 'b', { targetId: 'c', position: 'before' })).toBe(items);
    expect(movePromptItem(items, 'b', { targetId: 'b', position: 'before' })).toBe(items);
    expect(movePromptItem(items, 'b', null)).toBe(items);
  });

  it('ignores ids that are no longer in the list', () => {
    expect(movePromptItem(items, 'gone', { targetId: 'a', position: 'before' })).toBe(items);
    expect(movePromptItem(items, 'a', { targetId: 'gone', position: 'before' })).toBe(items);
  });

  it('does not reorder the original array', () => {
    movePromptItem(items, 'd', { targetId: 'a', position: 'before' });
    expect(ids(items)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('lands next to the visible neighbour when a filter hides rows', () => {
    // Only a and d are rendered; dropping d after a must keep hidden b and c
    // in their relative order behind it.
    expect(ids(movePromptItem(items, 'd', { targetId: 'a', position: 'after' }))).toEqual([
      'a',
      'd',
      'b',
      'c',
    ]);
  });
});

describe('stepPlacement', () => {
  const visible = ['a', 'c', 'e'];

  it('steps to the previous visible row', () => {
    expect(stepPlacement(visible, 'e', -1)).toEqual({ targetId: 'c', position: 'before' });
  });

  it('steps to the next visible row', () => {
    expect(stepPlacement(visible, 'a', 1)).toEqual({ targetId: 'c', position: 'after' });
  });

  it('stops at both ends and at unknown ids', () => {
    expect(stepPlacement(visible, 'a', -1)).toBeNull();
    expect(stepPlacement(visible, 'e', 1)).toBeNull();
    expect(stepPlacement(visible, 'b', -1)).toBeNull();
  });
});
