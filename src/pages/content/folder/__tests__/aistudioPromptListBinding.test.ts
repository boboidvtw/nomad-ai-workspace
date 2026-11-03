import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AIStudioPromptListBinding,
  type PromptListBindingOptions,
  applyNativeTitles,
  libraryTableMutated,
} from '../aistudioPromptListBinding';
import type { FolderData } from '../types';

function conv(id: string, title: string, extra: { customTitle?: boolean } = {}) {
  return { conversationId: id, title, url: `/prompts/${id}`, addedAt: 1, ...extra };
}

function historyRoot(promptId: string, title: string) {
  const root = document.createElement('ms-prompt-history-v3');
  const li = document.createElement('li');
  const anchor = document.createElement('a');
  anchor.className = 'prompt-link';
  anchor.setAttribute('href', `/prompts/${promptId}`);
  anchor.textContent = title;
  li.appendChild(anchor);
  root.appendChild(li);
  document.body.appendChild(root);
  return { root, li, anchor };
}

function libraryRow(promptId: string): HTMLTableRowElement {
  const table = document.createElement('table');
  table.className = 'mat-mdc-table';
  const row = document.createElement('tr');
  row.className = 'mat-mdc-row';
  const cell = document.createElement('td');
  const anchor = document.createElement('a');
  anchor.setAttribute('href', `/prompts/${promptId}`);
  anchor.textContent = `Prompt ${promptId}`;
  cell.appendChild(anchor);
  row.appendChild(cell);
  table.appendChild(row);
  document.body.appendChild(table);
  return row;
}

function setup(data: FolderData, root: HTMLElement | null = null) {
  let current = data;
  const options: PromptListBindingOptions = {
    getHistoryRoot: () => root,
    getData: () => current,
    setData: vi.fn((next: FolderData) => {
      current = next;
    }),
    canEdit: () => true,
    save: vi.fn().mockResolvedValue(true),
    render: vi.fn(),
    highlightActiveConversation: vi.fn(),
    bindLibraryRow: vi.fn(),
    afterLibraryRowsBound: vi.fn(),
  };
  const binding = new AIStudioPromptListBinding(options);
  return { binding, options, data: () => current };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('applyNativeTitles', () => {
  it('returns new data with native titles and leaves the input untouched', () => {
    const data: FolderData = {
      folders: [],
      folderContents: { a: [conv('p1', 'Old'), conv('p2', 'Mine', { customTitle: true })] },
    };

    const next = applyNativeTitles(
      data,
      new Map([
        ['p1', 'New'],
        ['p2', 'Native'],
      ]),
      42,
    );

    expect(next?.folderContents.a[0]).toMatchObject({ title: 'New', updatedAt: 42 });
    expect(next?.folderContents.a[1]?.title).toBe('Mine');
    expect(data.folderContents.a[0]?.title).toBe('Old');
  });

  it('returns null when nothing changes', () => {
    const data: FolderData = { folders: [], folderContents: { a: [conv('p1', 'Same')] } };

    expect(applyNativeTitles(data, new Map([['p1', 'Same']]), 1)).toBeNull();
  });
});

describe('libraryTableMutated', () => {
  it('detects added rows and mutations inside a table only', () => {
    const row = document.createElement('tr');
    row.className = 'mat-mdc-row';
    const unrelated = document.createElement('div');

    const added = (node: Node) =>
      ({ target: document.body, addedNodes: [node] }) as unknown as MutationRecord;

    expect(libraryTableMutated([added(row)])).toBe(true);
    expect(libraryTableMutated([added(unrelated)])).toBe(false);
  });
});

describe('AIStudioPromptListBinding', () => {
  it('syncs titles through setData, save and render', async () => {
    historyRoot('p1', 'Renamed');
    const { binding, options, data } = setup({
      folders: [],
      folderContents: { a: [conv('p1', 'Old')] },
    });

    await binding.syncConversationTitles();

    expect(data().folderContents.a[0]?.title).toBe('Renamed');
    expect(options.setData).toHaveBeenCalledTimes(1);
    expect(options.save).toHaveBeenCalledTimes(1);
    expect(options.render).toHaveBeenCalledTimes(1);
  });

  it('makes history rows draggable once with a conversation payload', () => {
    const { root, li } = historyRoot('p1', 'Title');
    const { binding } = setup({ folders: [], folderContents: {} }, root);

    binding.bindDraggablesInPromptList();
    binding.bindDraggablesInPromptList();

    expect(li.draggable).toBe(true);
    const setData = vi.fn();
    const event = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: { setData, setDragImage: vi.fn(), effectAllowed: '' },
    });
    li.dispatchEvent(event);
    const json = setData.mock.calls.find(([type]) => type === 'application/json')?.[1];
    expect(JSON.parse(json)).toMatchObject({ type: 'conversation', conversationId: 'p1' });
    expect(setData.mock.calls.filter(([type]) => type === 'application/json')).toHaveLength(1);
  });

  it('debounces prompt-list rebinds from the history observer and cleans up', async () => {
    vi.useFakeTimers();
    const { root } = historyRoot('p1', 'Title');
    const { binding } = setup({ folders: [], folderContents: {} }, root);
    const cleanup = binding.observePromptList();
    expect(cleanup).toBeTypeOf('function');

    const li = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.className = 'prompt-link';
    anchor.setAttribute('href', '/prompts/p2');
    li.appendChild(anchor);
    root.appendChild(li);
    await vi.advanceTimersByTimeAsync(200);
    expect(li.draggable).toBe(true);

    cleanup?.();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('binds library rows, reports them, and tears its observers down', () => {
    window.history.pushState({}, '', '/library');
    const row = libraryRow('lib1');
    const { binding, options } = setup({ folders: [], folderContents: {} });

    binding.observeLibraryTable();
    binding.observeBodyPromptPopovers();
    binding.bindDraggablesInLibraryTable();

    expect(row.draggable).toBe(true);
    expect(options.bindLibraryRow).toHaveBeenCalledWith(row);
    expect(options.afterLibraryRowsBound).toHaveBeenCalledTimes(1);
    expect(binding.libraryTableObserver).not.toBeNull();
    expect(binding.bodyPromptPopoverObserver).not.toBeNull();

    binding.destroy();
    expect(binding.libraryTableObserver).toBeNull();
    expect(binding.bodyPromptPopoverObserver).toBeNull();
    window.history.pushState({}, '', '/');
  });
});
