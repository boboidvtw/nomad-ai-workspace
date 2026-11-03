import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AIStudioLibraryMultiSelect,
  MAX_LIBRARY_BATCH_DELETE_COUNT,
  parseDeleteKeywords,
} from '../aistudioLibraryMultiSelect';

const t = (key: string) =>
  ({
    folder_multi_select_count: '{count} selected',
    batch_delete_limit_reached: 'max {max}',
  })[key] ?? key;

function libraryRow(id: string): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.className = 'mat-mdc-row';
  const cell = document.createElement('td');
  const a = document.createElement('a');
  a.setAttribute('href', `/prompts/${id}`);
  a.textContent = id;
  cell.appendChild(a);
  row.appendChild(cell);
  document.body.appendChild(row);
  return row;
}

function create() {
  const showNotification = vi.fn();
  const select = new AIStudioLibraryMultiSelect({
    t,
    showNotification,
    createIcon: (name) => {
      const span = document.createElement('span');
      span.textContent = name;
      return span;
    },
  });
  return { select, showNotification };
}

const countText = () =>
  document.querySelector('[data-multi-select-floating-host="true"] [data-selection-count="true"]')
    ?.textContent;

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('AIStudioLibraryMultiSelect', () => {
  it('enters on long press and toggles further rows by click', async () => {
    vi.useFakeTimers();
    const first = libraryRow('a1');
    const second = libraryRow('a2');
    const { select } = create();
    select.bindRow(first);
    select.bindRow(second);

    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await vi.advanceTimersByTimeAsync(500);
    expect(select.active).toBe(true);
    expect(countText()).toBe('1 selected');

    second.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(second.classList.contains('gv-library-row-selected')).toBe(true);
    expect(countText()).toBe('2 selected');

    second.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(second.classList.contains('gv-library-row-selected')).toBe(false);
    expect(countText()).toBe('1 selected');
  });

  it('binds a row only once', async () => {
    vi.useFakeTimers();
    const row = libraryRow('b1');
    const { select } = create();
    select.bindRow(row);
    select.bindRow(row);
    select.enter('b0');

    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(countText()).toBe('2 selected');
  });

  it('leaves multi-select mode when the last row is deselected', () => {
    libraryRow('c1');
    const { select } = create();
    select.enter('c1');
    select.toggle('c1');
    expect(select.active).toBe(false);
    expect(document.querySelector('.gv-multi-select-mode')).toBeNull();
  });

  it('refuses to select past the batch limit and says so', () => {
    const { select, showNotification } = create();
    select.enter('id-0');
    for (let i = 1; i < MAX_LIBRARY_BATCH_DELETE_COUNT; i++) select.toggle(`id-${i}`);
    select.toggle('one-too-many');

    expect(countText()).toBe(`${MAX_LIBRARY_BATCH_DELETE_COUNT} selected`);
    expect(showNotification).toHaveBeenCalledWith(`max ${MAX_LIBRARY_BATCH_DELETE_COUNT}`, 'info');
  });

  it('exits on a click outside the rows and the floating host', async () => {
    vi.useFakeTimers();
    libraryRow('d1');
    const { select } = create();
    select.enter('d1');
    await vi.advanceTimersByTimeAsync(0);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(select.active).toBe(false);
  });

  it('destroy removes the floating host and the outside-click listener', async () => {
    vi.useFakeTimers();
    const { select } = create();
    select.enter('e1');
    await vi.advanceTimersByTimeAsync(0);

    select.destroy();
    expect(document.querySelector('[data-multi-select-floating-host="true"]')).toBeNull();
    expect(select.active).toBe(false);
  });

  it('does nothing when the batch delete is not confirmed', async () => {
    const row = libraryRow('f1');
    const more = document.createElement('button');
    more.setAttribute('aria-label', 'More options');
    const moreClick = vi.fn();
    more.addEventListener('click', moreClick);
    row.appendChild(more);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { select } = create();
    select.enter('f1');

    (document.querySelector('.gv-multi-select-delete-btn') as HTMLButtonElement).click();
    await Promise.resolve();

    expect(confirmSpy).toHaveBeenCalled();
    expect(moreClick).not.toHaveBeenCalled();
    expect(select.active).toBe(true);
    confirmSpy.mockRestore();
  });
});

describe('parseDeleteKeywords', () => {
  it('splits on ASCII and CJK separators and lowercases', () => {
    expect(parseDeleteKeywords('Delete, 刪除，削除、Remove；x;')).toEqual([
      'delete',
      '刪除',
      '削除',
      'remove',
      'x',
    ]);
    expect(parseDeleteKeywords('')).toEqual([]);
  });
});
