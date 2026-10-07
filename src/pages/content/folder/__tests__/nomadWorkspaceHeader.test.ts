import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WORKSPACE_COLLAPSED_STORAGE_KEY,
  applyWorkspaceCollapsedState,
  createWorkspaceHeader,
  persistWorkspaceCollapsed,
  readWorkspaceCollapsed,
} from '../nomadWorkspaceHeader';

function mountPanel(collapsed: boolean, onToggle = vi.fn()) {
  const panel = document.createElement('div');
  const header = createWorkspaceHeader({ collapsed, onToggle });
  const body = document.createElement('div');
  body.className = 'nomad-workspace-body';
  panel.append(header, body);
  document.body.appendChild(panel);
  return { panel, header, body, onToggle };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('workspace collapsed preference', () => {
  it('defaults to expanded and round-trips through localStorage', () => {
    expect(readWorkspaceCollapsed()).toBe(false);

    persistWorkspaceCollapsed(true);
    expect(localStorage.getItem(WORKSPACE_COLLAPSED_STORAGE_KEY)).toBe('true');
    expect(readWorkspaceCollapsed()).toBe(true);

    persistWorkspaceCollapsed(false);
    expect(readWorkspaceCollapsed()).toBe(false);
  });
});

describe('createWorkspaceHeader', () => {
  it('renders an accessible toggle reflecting the initial state', () => {
    const { header } = mountPanel(true);

    expect(header.getAttribute('role')).toBe('button');
    expect(header.getAttribute('tabindex')).toBe('0');
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.textContent).toContain('Nomad Workspace');
  });

  it('calls onToggle on click and on Enter or Space', () => {
    const { header, onToggle } = mountPanel(false);

    header.click();
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    header.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    header.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));

    expect(onToggle).toHaveBeenCalledTimes(3);
  });

  it('opens the options page from the sync button without toggling', () => {
    const openOptionsPage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { openOptionsPage } });
    const { header, onToggle } = mountPanel(false);

    header.querySelector<HTMLButtonElement>('button')!.click();

    expect(openOptionsPage).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('applyWorkspaceCollapsedState', () => {
  it('hides the body and updates aria-expanded, then restores both', () => {
    const { panel, header, body } = mountPanel(false);

    applyWorkspaceCollapsedState(panel, true);
    expect(body.style.display).toBe('none');
    expect(header.getAttribute('aria-expanded')).toBe('false');

    applyWorkspaceCollapsedState(panel, false);
    expect(body.style.display).toBe('');
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  it('ignores a missing panel', () => {
    expect(() => applyWorkspaceCollapsedState(null, true)).not.toThrow();
  });
});
