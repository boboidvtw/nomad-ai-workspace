import { describe, expect, it, vi } from 'vitest';

import type { SavedLibraryItem } from '@/features/savedLibrary/model';

import { buildSavedLibraryRows, getSavedLibraryEmptyText } from '../savedLibraryRows';

const t = (key: string) => `<${key}>`;

const starred: SavedLibraryItem = {
  id: 's1',
  kind: 'starred',
  conversationId: 'c1',
  conversationUrl: 'https://gemini.google.com/app/c1',
  conversationTitle: '  Math  ',
  turnId: 't1',
  content: '2 + 3 = 5',
  savedAt: new Date(2026, 10, 3, 9, 5).getTime(),
};

const highlight: SavedLibraryItem = {
  id: 'h1',
  kind: 'highlight',
  conversationId: 'c2',
  conversationUrl: 'https://gemini.google.com/app/c2',
  turnId: 't2',
  content: 'quoted',
  note: 'my note',
  color: 'green',
  savedAt: new Date(2026, 10, 3, 9, 5).getTime(),
};

function render(items: SavedLibraryItem[]) {
  const onOpen = vi.fn();
  const onRemove = vi.fn();
  const host = document.createElement('div');
  host.appendChild(buildSavedLibraryRows(items, { t, onOpen, onRemove }));
  return { host, onOpen, onRemove };
}

describe('getSavedLibraryEmptyText', () => {
  it('explains why the list is empty, most specific reason first', () => {
    const base = { loadError: false, query: '', filter: 'all' as const };
    expect(getSavedLibraryEmptyText({ ...base, loadError: true, query: 'x' }, t)).toBe(
      '<pm_starred_load_error>',
    );
    expect(getSavedLibraryEmptyText({ ...base, query: 'x' }, t)).toBe('<pm_starred_no_results>');
    expect(getSavedLibraryEmptyText({ ...base, filter: 'highlights' }, t)).toBe(
      '<savedLibraryNoHighlights>',
    );
    expect(getSavedLibraryEmptyText({ ...base, filter: 'starred' }, t)).toBe('<noStarredMessages>');
    expect(getSavedLibraryEmptyText(base, t)).toBe('<savedLibraryEmpty>');
  });
});

describe('buildSavedLibraryRows', () => {
  it('renders a starred message with its trimmed title, content and kind label', () => {
    const { host } = render([starred]);
    const row = host.querySelector('.gv-pm-starred-item')!;

    expect(row.getAttribute('type')).toBe('button');
    expect(row.getAttribute('title')).toBe('<pm_starred_open>');
    expect(row.querySelector('.gv-pm-starred-title')!.textContent).toBe('Math');
    expect(row.querySelector('.gv-pm-starred-content')!.textContent).toBe('2 + 3 = 5');
    expect(row.querySelector('.gv-pm-starred-meta')!.textContent).toBe(
      '<savedLibraryStars> · 2026-11-03 09:05:00',
    );
    expect(row.querySelector('.gv-pm-starred-icon svg')).not.toBeNull();
    expect(row.querySelector('.gv-pm-highlight-note')).toBeNull();
    expect(row.querySelector('.gv-pm-starred-remove')!.getAttribute('aria-label')).toBe(
      '<removeFromStarred>',
    );
  });

  it('renders a highlight with its colour, note and an untitled fallback', () => {
    const { host } = render([highlight]);
    const row = host.querySelector('.gv-pm-starred-item')!;
    const icon = row.querySelector<HTMLElement>('.gv-pm-starred-icon')!;

    expect(icon.classList.contains('gv-pm-highlight-icon')).toBe(true);
    expect(icon.getAttribute('data-highlight-color')).toBe('green');
    expect(icon.style.backgroundColor).not.toBe('');
    expect(row.querySelector('.gv-pm-starred-title')!.textContent).toBe('<pm_starred_untitled>');
    expect(row.querySelector('.gv-pm-highlight-note')!.textContent).toBe('my note');
    expect(row.querySelector('.gv-pm-starred-meta')!.textContent).toMatch(
      /^<savedLibraryHighlights> · /,
    );
    expect(row.querySelector('.gv-pm-starred-remove')!.getAttribute('title')).toBe('<pm_delete>');
  });

  it('opens an item from its row and removes it from its button without opening it', () => {
    const { host, onOpen, onRemove } = render([starred, highlight]);
    const rows = host.querySelectorAll<HTMLButtonElement>('.gv-pm-starred-item');

    rows[1].click();
    expect(onOpen).toHaveBeenCalledWith(highlight);

    onOpen.mockClear();
    rows[0].querySelector<HTMLButtonElement>('.gv-pm-starred-remove')!.click();
    expect(onRemove).toHaveBeenCalledWith(starred);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
