import { afterEach, describe, expect, it } from 'vitest';

import {
  buildLibraryPromptData,
  extractPromptId,
  extractPromptIdFromHref,
  extractPromptTitle,
  getLibraryPromptRows,
  parseDragDataFromEvent,
  setPromptDragData,
} from '../aistudioPromptLinks';

function anchor(href: string, attrs: Record<string, string> = {}, text = ''): HTMLAnchorElement {
  const a = document.createElement('a');
  a.setAttribute('href', href);
  for (const [name, value] of Object.entries(attrs)) a.setAttribute(name, value);
  a.textContent = text;
  return a;
}

function libraryRow(href: string, title: string): HTMLTableRowElement {
  const row = document.createElement('tr');
  row.className = 'mat-mdc-row';
  const cell = document.createElement('td');
  cell.appendChild(anchor(href, {}, title));
  row.appendChild(cell);
  document.body.appendChild(row);
  return row;
}

function fakeTransfer(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    store,
    effectAllowed: 'none',
    setData: (type: string, value: string) => {
      store[type] = value;
    },
    getData: (type: string) => store[type] ?? '',
    setDragImage: () => {},
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('extractPromptIdFromHref', () => {
  it('reads the id from relative, account-prefixed and absolute prompt links', () => {
    expect(extractPromptIdFromHref('/prompts/abc123')).toBe('abc123');
    expect(extractPromptIdFromHref('/u/1/prompts/def456?model=x#top')).toBe('def456');
    expect(extractPromptIdFromHref('https://aistudio.google.com/prompts/ghi789')).toBe('ghi789');
  });

  it('returns null for links that are not prompts', () => {
    expect(extractPromptIdFromHref('')).toBeNull();
    expect(extractPromptIdFromHref('/library')).toBeNull();
  });
});

describe('extractPromptId', () => {
  it('falls back to the second path segment when the link has no /prompts/ part', () => {
    expect(extractPromptId(anchor('/prompts/abc'))).toBe('abc');
    expect(extractPromptId(anchor('/app/xyz'))).toBe('xyz');
  });
});

describe('extractPromptTitle', () => {
  it('prefers aria-label, then title, then the visible text', () => {
    expect(
      extractPromptTitle(anchor('/prompts/a', { 'aria-label': ' Aria ', title: 'T' }, 'X')),
    ).toBe('Aria');
    expect(extractPromptTitle(anchor('/prompts/a', { title: 'Tip  text' }, 'X'))).toBe('Tip text');
    expect(extractPromptTitle(anchor('/prompts/a', {}, '  Visible\n title '))).toBe(
      'Visible title',
    );
  });

  it('returns null when nothing usable is present', () => {
    expect(extractPromptTitle(null)).toBeNull();
    expect(extractPromptTitle(anchor('/prompts/a'))).toBeNull();
  });
});

describe('library prompt rows', () => {
  it('only lists table rows that hold a prompt link', () => {
    const promptRow = libraryRow('/prompts/p1', 'First');
    const other = document.createElement('tr');
    other.className = 'mat-mdc-row';
    document.body.appendChild(other);

    expect(getLibraryPromptRows()).toEqual([promptRow]);
  });

  it('builds drag data with an absolute url', () => {
    const row = libraryRow('/prompts/p2', 'Second');
    expect(buildLibraryPromptData(row)).toEqual({
      type: 'conversation',
      conversationId: 'p2',
      title: 'Second',
      url: `${location.origin}/prompts/p2`,
    });
  });
});

describe('drag payload round trip', () => {
  it('reads back the JSON payload it wrote', () => {
    const transfer = fakeTransfer();
    const event = { dataTransfer: transfer } as unknown as DragEvent;
    const data = {
      type: 'conversation' as const,
      conversationId: 'abc',
      title: 'Hello',
      url: 'https://aistudio.google.com/prompts/abc',
    };

    setPromptDragData(event, data, document.createElement('div'));

    expect(transfer.effectAllowed).toBe('move');
    expect(transfer.store['text/uri-list']).toBe(data.url);
    expect(transfer.store['text/x-moz-url']).toBe(`${data.url}\nHello`);
    expect(parseDragDataFromEvent(event)).toEqual(data);
  });

  it('falls back to a bare URL payload, as Firefox native drags send', () => {
    const event = {
      dataTransfer: fakeTransfer({ 'text/uri-list': 'https://aistudio.google.com/prompts/zz9' }),
    } as unknown as DragEvent;

    expect(parseDragDataFromEvent(event)).toEqual({
      type: 'conversation',
      conversationId: 'zz9',
      title: '',
      url: 'https://aistudio.google.com/prompts/zz9',
    });
  });

  it('returns null without a data transfer', () => {
    expect(parseDragDataFromEvent({ dataTransfer: null } as unknown as DragEvent)).toBeNull();
  });
});
