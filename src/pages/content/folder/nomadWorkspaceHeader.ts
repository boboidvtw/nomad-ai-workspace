import {
  createChevronDownIcon,
  createChevronRightIcon,
  createCloudIcon,
} from '@/core/icons/folderIcons';

/**
 * The collapsible "Nomad Workspace" header that wraps the Gemini folder panel
 * and the cross-platform tree. Collapsed state is a per-browser UI preference.
 */

export const WORKSPACE_COLLAPSED_STORAGE_KEY = 'nomad_workspace_collapsed';

export function readWorkspaceCollapsed(): boolean {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(WORKSPACE_COLLAPSED_STORAGE_KEY) === 'true';
    }
  } catch {}
  return false;
}

export function persistWorkspaceCollapsed(collapsed: boolean): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WORKSPACE_COLLAPSED_STORAGE_KEY, String(collapsed));
    }
  } catch {}
}

export function createWorkspaceHeader({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}): HTMLElement {
  const header = document.createElement('div');
  header.className =
    'nomad-workspace-header flex items-center justify-between px-3 py-2 border-b border-white/10 select-none cursor-pointer';
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');
  header.setAttribute('aria-expanded', String(!collapsed));

  const left = document.createElement('div');
  left.className = 'flex items-center gap-1.5';

  const chevron = document.createElement('span');
  chevron.className = 'nomad-workspace-chevron flex-shrink-0 opacity-70';
  chevron.replaceChildren(collapsed ? createChevronRightIcon(14) : createChevronDownIcon(14));

  const sparkles = document.createElement('span');
  sparkles.className = 'text-blue-400 flex-shrink-0';
  sparkles.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`;

  const title = document.createElement('span');
  title.className = 'text-xs font-semibold tracking-wide text-zinc-200';
  title.textContent = 'Nomad Workspace';

  left.appendChild(chevron);
  left.appendChild(sparkles);
  left.appendChild(title);
  header.appendChild(left);

  const right = document.createElement('div');
  right.className = 'flex items-center gap-1';

  const syncBtn = document.createElement('button');
  syncBtn.type = 'button';
  syncBtn.className =
    'p-1 rounded text-xs opacity-70 hover:opacity-100 hover:bg-white/5 transition-opacity';
  syncBtn.title = 'Google Drive 雲端同步設定';
  syncBtn.replaceChildren(createCloudIcon(14));
  syncBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
    } catch {}
  });
  right.appendChild(syncBtn);
  header.appendChild(right);

  header.addEventListener('click', () => onToggle());
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  });

  return header;
}

/** Sync the header, chevron and body under `container` with the collapsed state. */
export function applyWorkspaceCollapsedState(
  container: HTMLElement | null | undefined,
  collapsed: boolean,
): void {
  if (!container) return;

  const header = container.querySelector<HTMLElement>('.nomad-workspace-header');
  const body = container.querySelector<HTMLElement>('.nomad-workspace-body');
  const chevron = container.querySelector<HTMLElement>('.nomad-workspace-chevron');

  if (header) {
    header.setAttribute('aria-expanded', String(!collapsed));
  }
  if (chevron) {
    chevron.replaceChildren(collapsed ? createChevronRightIcon(14) : createChevronDownIcon(14));
  }
  if (body) {
    body.style.display = collapsed ? 'none' : '';
  }
}
