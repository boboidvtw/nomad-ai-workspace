import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountLibraryDropZone } from '../aistudioLibraryDropZone';
import type { FolderData } from '../types';

const UNCATEGORIZED = '__uncategorized__';

function folderData(): FolderData {
  return {
    folders: [
      { id: 'f1', name: 'Work', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
      { id: 'f2', name: 'Sub', parentId: 'f1', isExpanded: true, createdAt: 2, updatedAt: 2 },
    ],
    folderContents: {
      f1: [],
      f2: [{ conversationId: 'p1', title: 'Old', url: '/prompts/p1', addedAt: 1 }],
    },
  };
}

function mount(data: FolderData, canEdit = true) {
  const save = vi.fn().mockResolvedValue(true);
  const showNotification = vi.fn();
  const cleanup = mountLibraryDropZone({
    t: (key) => key,
    canEdit: () => canEdit,
    getData: () => data,
    save,
    getScopeRequest: () => 0,
    showNotification,
    uncategorizedKey: UNCATEGORIZED,
  });
  return { cleanup, save, showNotification };
}

function startLibraryDrag(): void {
  const row = document.createElement('tr');
  row.className = 'mat-mdc-row';
  const a = document.createElement('a');
  a.setAttribute('href', '/prompts/p1');
  row.appendChild(a);
  document.body.appendChild(row);
  row.dispatchEvent(new Event('dragstart', { bubbles: true }));
}

function dropEvent(payload: object): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  const json = JSON.stringify(payload);
  Object.defineProperty(event, 'dataTransfer', {
    value: { getData: (type: string) => (type === 'application/json' ? json : '') },
  });
  return event;
}

const zone = () => document.querySelector<HTMLElement>('.gv-library-drop-zone');
const payload = { type: 'conversation', conversationId: 'p1', title: 'New', url: '/prompts/p1' };

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('mountLibraryDropZone', () => {
  it('shows the zone with root, folders and subfolders when a library row is dragged', async () => {
    vi.useFakeTimers();
    mount(folderData());
    startLibraryDrag();
    await vi.advanceTimersByTimeAsync(0);

    expect(zone()?.style.opacity).toBe('1');
    const items = Array.from(document.querySelectorAll('.gv-library-folder-item'));
    expect(items.map((el) => el.textContent)).toEqual([
      'inboxfolder_uncategorized',
      'folderWork',
      'subdirectory_arrow_rightSub',
    ]);
  });

  it('shows even when the row stops dragstart from bubbling', async () => {
    vi.useFakeTimers();
    mount(folderData());
    const row = document.createElement('tr');
    row.className = 'mat-mdc-row';
    const cell = document.createElement('td');
    const a = document.createElement('a');
    a.setAttribute('href', '/prompts/p1');
    cell.appendChild(a);
    row.appendChild(cell);
    document.body.appendChild(row);
    row.addEventListener('dragstart', (e) => e.stopPropagation(), true);

    cell.dispatchEvent(new Event('dragstart', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);

    expect(zone()?.style.opacity).toBe('1');
  });

  it('cleanup also removes the capture-phase dragstart listener', async () => {
    vi.useFakeTimers();
    const { cleanup } = mount(folderData());
    const remove = vi.spyOn(document, 'removeEventListener');
    cleanup();
    expect(remove).toHaveBeenCalledWith('dragstart', expect.any(Function), true);
  });

  it('stays hidden while the folder data cannot be edited', async () => {
    vi.useFakeTimers();
    mount(folderData(), false);
    startLibraryDrag();
    await vi.advanceTimersByTimeAsync(0);

    expect(zone()?.style.opacity).not.toBe('1');
    expect(document.querySelector('.gv-library-folder-item')).toBeNull();
  });

  it('moves a dropped conversation into the target folder only', async () => {
    vi.useFakeTimers();
    const data = folderData();
    const { save, showNotification } = mount(data);
    startLibraryDrag();
    await vi.advanceTimersByTimeAsync(0);

    document.querySelector('[data-folder-id="f1"]')!.dispatchEvent(dropEvent(payload));
    await vi.advanceTimersByTimeAsync(0);

    expect(data.folderContents.f1.map((c) => c.conversationId)).toEqual(['p1']);
    expect(data.folderContents.f1[0].title).toBe('New');
    expect(data.folderContents.f2).toEqual([]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith('conversation_added_to_folder "Work"', 'info');
  });

  it('moves a conversation dropped on the root item to Uncategorized', async () => {
    vi.useFakeTimers();
    const data = folderData();
    const { save } = mount(data);
    startLibraryDrag();
    await vi.advanceTimersByTimeAsync(0);

    document.querySelector('.gv-library-root-item')!.dispatchEvent(dropEvent(payload));
    await vi.advanceTimersByTimeAsync(0);

    expect(data.folderContents[UNCATEGORIZED].map((c) => c.conversationId)).toEqual(['p1']);
    expect(data.folderContents.f2).toEqual([]);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('creates a default folder when there is none', async () => {
    vi.useFakeTimers();
    const data: FolderData = { folders: [], folderContents: {} };
    const { save } = mount(data);
    startLibraryDrag();
    await vi.advanceTimersByTimeAsync(0);

    expect(data.folders).toHaveLength(1);
    expect(data.folders[0].name).toBe('folder_default_name');
    expect(save).toHaveBeenCalled();
  });

  it('cleanup removes the zone and stops reacting to drags', async () => {
    vi.useFakeTimers();
    const { cleanup } = mount(folderData());
    cleanup();
    expect(zone()).toBeNull();

    startLibraryDrag();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector('.gv-library-folder-item')).toBeNull();
  });
});
