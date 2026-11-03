/**
 * The rows of the Prompt Manager's Saved Library view (starred messages and highlights). What
 * opening or removing an item does stays with the panel, which owns that state.
 */
import { createStarIcon } from '@/core/icons/folderIcons';
import { getHighlightColorHex } from '@/core/types/highlight';
import type { SavedLibraryFilter, SavedLibraryItem } from '@/features/savedLibrary/model';
import type { TranslationKey } from '@/utils/translations';

import { createEl } from './promptManagerHelpers';
import { formatStarredMessageTime } from './starredLibrary';

type Translate = (key: TranslationKey) => string;

/** Why the Saved Library shows nothing, most specific reason first. */
export function getSavedLibraryEmptyText(
  state: { loadError: boolean; query: string; filter: SavedLibraryFilter },
  t: Translate,
): string {
  if (state.loadError) return t('pm_starred_load_error');
  if (state.query) return t('pm_starred_no_results');
  if (state.filter === 'highlights') return t('savedLibraryNoHighlights');
  if (state.filter === 'starred') return t('noStarredMessages');
  return t('savedLibraryEmpty');
}

/**
 * One button per item: the row opens it, its remove button removes it (without opening it).
 * @returns a fragment to append to the list
 */
export function buildSavedLibraryRows(
  items: readonly SavedLibraryItem[],
  handlers: {
    t: Translate;
    onOpen: (item: SavedLibraryItem) => void;
    onRemove: (item: SavedLibraryItem) => void;
  },
): DocumentFragment {
  const { t } = handlers;
  const frag = document.createDocumentFragment();
  for (const item of items) {
    const row = createEl('button', 'gv-pm-starred-item');
    row.setAttribute('type', 'button');
    row.setAttribute('dir', 'auto');
    row.title = t('pm_starred_open');
    row.addEventListener('click', (event) => {
      event.preventDefault();
      handlers.onOpen(item);
    });

    const icon = createEl('span', 'gv-pm-starred-icon');
    if (item.kind === 'starred') icon.appendChild(createStarIcon(16, true));
    icon.classList.toggle('gv-pm-highlight-icon', item.kind === 'highlight');
    if (item.kind === 'highlight') {
      icon.setAttribute('data-highlight-color', item.color || 'yellow');
      icon.style.backgroundColor = getHighlightColorHex(item.color || 'yellow');
    }
    icon.setAttribute('aria-hidden', 'true');

    const body = createEl('span', 'gv-pm-starred-body');
    const title = createEl('span', 'gv-pm-starred-title');
    title.textContent =
      (item.conversationTitle && item.conversationTitle.trim()) || t('pm_starred_untitled');
    const content = createEl('span', 'gv-pm-starred-content');
    content.textContent = item.content || '';
    let note: HTMLSpanElement | null = null;
    if (item.note) {
      note = createEl('span', 'gv-pm-highlight-note');
      note.textContent = item.note;
    }
    const meta = createEl('span', 'gv-pm-starred-meta');
    meta.textContent = `${
      item.kind === 'starred' ? t('savedLibraryStars') : t('savedLibraryHighlights')
    } · ${formatStarredMessageTime(item.savedAt)}`;
    body.appendChild(title);
    body.appendChild(content);
    if (note) body.appendChild(note);
    body.appendChild(meta);

    const removeBtn = createEl('button', 'gv-pm-starred-remove');
    removeBtn.setAttribute('type', 'button');
    const removeLabel = item.kind === 'starred' ? t('removeFromStarred') : t('pm_delete');
    removeBtn.title = removeLabel;
    removeBtn.setAttribute('aria-label', removeLabel);
    removeBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handlers.onRemove(item);
    });

    row.appendChild(icon);
    row.appendChild(body);
    row.appendChild(removeBtn);
    frag.appendChild(row);
  }
  return frag;
}
