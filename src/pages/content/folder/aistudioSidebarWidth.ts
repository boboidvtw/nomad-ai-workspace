/**
 * The AI Studio sidebar width: stored in sync storage with a localStorage copy, applied
 * to the native nav while it is expanded, and changed with a drag handle on its edge.
 */
import browser from 'webextension-polyfill';

export const SIDEBAR_WIDTH_KEY = 'gvAIStudioSidebarWidth';
export const MIN_SIDEBAR_WIDTH = 240;
export const MAX_SIDEBAR_WIDTH = 600;
/** Default, wide enough to keep most titles from truncating. */
const DEFAULT_SIDEBAR_WIDTH = 360;

export interface SidebarWidthOptions {
  isExtensionContextValid: () => boolean;
}

export class AIStudioSidebarWidth {
  private currentWidth = DEFAULT_SIDEBAR_WIDTH;

  constructor(private readonly options: SidebarWidthOptions) {}

  get width(): number {
    return this.currentWidth;
  }

  /**
   * Load sidebar width from storage (with localStorage fallback)
   */
  async load(): Promise<void> {
    try {
      // Try chrome.storage.sync first
      if (this.options.isExtensionContextValid()) {
        const result = await browser.storage.sync.get({ [SIDEBAR_WIDTH_KEY]: 280 });
        const width = result[SIDEBAR_WIDTH_KEY];
        if (typeof width === 'number' && width >= MIN_SIDEBAR_WIDTH && width <= MAX_SIDEBAR_WIDTH) {
          this.currentWidth = width;
          return;
        }
      }
    } catch (error) {
      console.warn(
        '[AIStudioFolderManager] Failed to load from sync storage, trying localStorage:',
        error,
      );
    }

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
      if (stored) {
        const width = parseInt(stored, 10);
        if (typeof width === 'number' && width >= MIN_SIDEBAR_WIDTH && width <= MAX_SIDEBAR_WIDTH) {
          this.currentWidth = width;
        }
      }
    } catch (error) {
      console.error(
        '[AIStudioFolderManager] Failed to load sidebar width from localStorage:',
        error,
      );
    }
  }

  /**
   * Save sidebar width to storage (with localStorage fallback)
   */
  async save(): Promise<void> {
    // Always save to localStorage as immediate backup
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(this.currentWidth));
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to save to localStorage:', error);
    }

    // Try to save to chrome.storage.sync if context is valid
    if (this.options.isExtensionContextValid()) {
      try {
        await browser.storage.sync.set({ [SIDEBAR_WIDTH_KEY]: this.currentWidth });
      } catch (error) {
        // Silent fail if extension context is invalidated (happens during dev reload)
        if (error instanceof Error && !error.message.includes('Extension context invalidated')) {
          console.error('[AIStudioFolderManager] Failed to save sidebar width:', error);
        }
      }
    }
  }

  /**
   * Apply sidebar width to the navbar element (only when expanded)
   */
  apply(force: boolean = false): void {
    // Target the actual nav-content div, not the outer ms-navbar
    const navContent = document.querySelector('.nav-content.v3-left-nav') as HTMLElement | null;
    if (!navContent) return;

    // Check if sidebar is expanded by looking at the 'expanded' class
    const isExpanded = navContent.classList.contains('expanded');

    if (isExpanded || force) {
      navContent.style.width = `${this.currentWidth}px`;
      navContent.style.minWidth = `${this.currentWidth}px`;
      navContent.style.maxWidth = `${this.currentWidth}px`;
      navContent.style.flex = `0 0 ${this.currentWidth}px`;
    } else {
      // Remove our width overrides when collapsed to allow native behavior
      navContent.style.width = '';
      navContent.style.minWidth = '';
      navContent.style.maxWidth = '';
      navContent.style.flex = '';
    }
  }

  /** Take a width another tab stored; anything but a number is ignored. */
  applyStoredWidth(value: unknown): void {
    if (typeof value !== 'number') return;
    this.currentWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, Math.round(value)));
    this.apply();
  }

  /**
   * Add a draggable resize handle to adjust sidebar width.
   * @returns cleanup that removes the handle, or null when the nav is not mounted
   */
  attachResizeHandle(): (() => void) | null {
    // Target the actual nav-content div
    const navContent = document.querySelector('.nav-content.v3-left-nav') as HTMLElement | null;
    if (!navContent) {
      console.warn('[AIStudioFolderManager] nav-content not found, resize handle not added');
      return null;
    }

    // Create resize handle
    const handle = document.createElement('div');
    handle.className = 'gv-sidebar-resize-handle';
    handle.title = 'Drag to resize sidebar';

    // Position it at the right edge of the nav-content with inline styles
    const handleStyle = handle.style;
    handleStyle.position = 'absolute';
    handleStyle.top = '0';
    handleStyle.right = '-4px'; // Position at right edge, overlapping slightly outside
    handleStyle.width = '8px';
    handleStyle.height = '100%';
    handleStyle.cursor = 'ew-resize';
    handleStyle.zIndex = '10000';
    handleStyle.backgroundColor = 'transparent';
    handleStyle.transition = 'background-color 0.2s';
    handleStyle.pointerEvents = 'auto';

    // Hover effect
    handle.addEventListener('mouseenter', () => {
      handleStyle.backgroundColor = 'rgba(66, 133, 244, 0.5)';
    });
    handle.addEventListener('mouseleave', () => {
      handleStyle.backgroundColor = 'transparent';
    });

    // Dragging logic
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = this.currentWidth;
      e.preventDefault();
      e.stopPropagation();

      // Add dragging class for visual feedback
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const delta = e.clientX - startX;
      const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, startWidth + delta));

      this.currentWidth = newWidth;
      this.apply(true); // Force apply during drag

      // Handle position is relative, no need to update during drag
    };

    const handleMouseUp = () => {
      if (!isDragging) return;

      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Save the new width
      this.save();
    };

    handle.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Ensure nav-content has position relative for absolute handle positioning
    navContent.style.position = 'relative';

    // Add to nav-content for correct positioning
    navContent.appendChild(handle);

    // Update handle visibility when sidebar state changes
    const updateHandleVisibility = () => {
      const isExpanded = navContent.classList.contains('expanded');

      if (isExpanded) {
        handleStyle.display = 'block';
      } else {
        handleStyle.display = 'none'; // Hide when collapsed
      }
    };

    // Monitor sidebar state changes by watching the 'expanded' class
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          updateHandleVisibility();
          this.apply(); // Reapply width based on current state
          break;
        }
      }
    });

    try {
      observer.observe(navContent, {
        attributes: true,
        attributeFilter: ['class'],
      });
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to observe nav-content:', error);
    }

    // Initial visibility update
    updateHandleVisibility();

    return () => {
      try {
        observer.disconnect();
        handle.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        if (handle.parentElement) {
          handle.parentElement.removeChild(handle);
        }
      } catch {}
    };
  }
}
