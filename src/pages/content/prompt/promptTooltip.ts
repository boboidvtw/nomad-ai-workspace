/* Fast, interactive hover tooltip for compact rows.
 * Opens after a short delay; hiding is deferred by a grace window long
 * enough for the user to cross the gap onto the tooltip itself, where
 * they can select text or scroll long prompts. Entering either the row or the
 * tooltip cancels any pending hide; leaving the tooltip schedules one.
 * A singleton element is reused across rows. */
import { highlightTemplateVariables } from './PromptTemplateFill';

const TOOLTIP_OPEN_DELAY_MS = 250;
const TOOLTIP_HIDE_GRACE_MS = 150;

export type PromptTooltipOptions = {
  /** The prompt panel: the preview sits beside it and follows its theme. */
  panel: HTMLElement;
  /** Scrolling any of these dismisses the preview (scrolling the preview itself does not). */
  scrollTargets: Array<HTMLElement | Window>;
  /** Resolves to sanitized HTML for the prompt text, or null to keep the raw text. */
  renderMarkdown: (text: string) => Promise<string | null>;
};

export type PromptTooltip = {
  attach(target: HTMLElement, fullText: string): void;
  /** Hard dismiss, for closePanel and similar; hover handlers use a grace window. */
  hide(): void;
  destroy(): void;
};

/** Flags "there is more below" so the surface can show it. */
function markTooltipOverflow(el: HTMLElement): void {
  const more = el.scrollHeight - el.scrollTop - el.clientHeight > 1;
  el.classList.toggle('gv-pm-tooltip-more', more);
}

/**
 * This preview hangs over a live conversation. A Markdown link rendered
 * into it is an ordinary same-tab anchor, so following one navigated the
 * host page away and took an in-progress chat with it. Everywhere else in
 * this file an outbound link opens in a new tab; the preview has to match.
 */
function openTooltipLinksInNewTab(root: HTMLElement): void {
  for (const link of root.querySelectorAll('a[href]')) {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  }
}

export function createPromptTooltip({
  panel,
  scrollTargets,
  renderMarkdown,
}: PromptTooltipOptions): PromptTooltip {
  let tooltipEl: HTMLDivElement | null = null;
  let tooltipBody: HTMLDivElement | null = null;
  /* Bumped on every open and every hide. A Markdown render started for one
   * row must not paint into the preview after the pointer has moved to a
   * different row, or after the preview has already been dismissed. */
  let tooltipRenderToken = 0;
  let tooltipOpenTimer: number | null = null;
  let tooltipHideTimer: number | null = null;
  let tooltipTargetHovered = false;
  let tooltipSelfHovered = false;

  function clearOpenTimer(): void {
    if (tooltipOpenTimer !== null) {
      window.clearTimeout(tooltipOpenTimer);
      tooltipOpenTimer = null;
    }
  }

  function clearHideTimer(): void {
    if (tooltipHideTimer !== null) {
      window.clearTimeout(tooltipHideTimer);
      tooltipHideTimer = null;
    }
  }

  function actuallyHideTooltip(): void {
    clearOpenTimer();
    clearHideTimer();
    tooltipRenderToken += 1;
    tooltipTargetHovered = false;
    tooltipSelfHovered = false;
    if (tooltipEl) {
      tooltipEl.classList.remove('gv-pm-tooltip-visible');
    }
  }

  function scheduleHide(): void {
    clearHideTimer();
    tooltipHideTimer = window.setTimeout(() => {
      tooltipHideTimer = null;
      if (!tooltipSelfHovered && !tooltipTargetHovered) {
        actuallyHideTooltip();
      }
    }, TOOLTIP_HIDE_GRACE_MS);
  }

  function ensureTooltipEl(): HTMLDivElement {
    if (tooltipEl) return tooltipEl;
    const el = document.createElement('div');
    el.className = 'gv-pm-tooltip';
    el.setAttribute('role', 'tooltip');
    // Entering the tooltip cancels any pending hide; leaving schedules it.
    // This is what lets the user glide from row → gap → tooltip and scroll.
    el.addEventListener('mouseenter', () => {
      tooltipSelfHovered = true;
      clearHideTimer();
    });
    el.addEventListener('mouseleave', () => {
      tooltipSelfHovered = false;
      scheduleHide();
    });
    // macOS hides overlay scrollbars until a scroll begins, so a clipped card
    // simply stopped mid-sentence and read as broken rather than scrollable.
    el.addEventListener('scroll', () => markTooltipOverflow(el), { passive: true });
    // Content lives in an inner .gv-md so the rendered Markdown is styled by
    // the same rules as the comfortable-mode list item, while the outer
    // element keeps the surface, scrolling and positioning.
    const body = document.createElement('div');
    body.className = 'gv-md';
    el.appendChild(body);
    document.body.appendChild(el);
    tooltipEl = el;
    tooltipBody = body;
    return el;
  }

  // Position: prefer above the target, fall back to below if clipped.
  // Measurement requires the element to be laid out, so reveal first then
  // adjust; CSS keeps it invisible until the `-visible` class is applied.
  // Called again once Markdown lands, because rendering changes the height.
  function positionTooltip(target: HTMLElement): void {
    const el = tooltipEl;
    if (!el) return;
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.visibility = 'hidden';
    el.classList.add('gv-pm-tooltip-visible');
    const targetRect = target.getBoundingClientRect();
    const tipRect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;

    const panelRect = panel.getBoundingClientRect();
    const gap = 10;

    // Beside the panel, never over it. The preview explains one row, and
    // starting it at that row's own left edge laid the card across the list -
    // hiding both the row it belongs to and every row the pointer was about
    // to travel to. Prefer the side with room; fall back to the roomier edge
    // of the viewport only when neither side fits.
    const roomRight = vw - panelRect.right - gap - pad;
    const roomLeft = panelRect.left - gap - pad;
    let left: number;
    if (roomRight >= tipRect.width) left = panelRect.right + gap;
    else if (roomLeft >= tipRect.width) left = panelRect.left - gap - tipRect.width;
    else left = roomRight >= roomLeft ? vw - pad - tipRect.width : pad;

    // Aligned to the row, then clamped into the viewport. Flipping between
    // above and below made the card jump the moment a row near the middle of
    // the list stopped fitting above it; sliding it keeps the card still
    // while the pointer moves down the list.
    let top = targetRect.top;
    if (top + tipRect.height > vh - pad) top = vh - pad - tipRect.height;
    if (top < pad) top = pad;

    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.visibility = '';
    // Only measurable once the card has its final size.
    markTooltipOverflow(el);
  }

  function showTooltip(target: HTMLElement, fullText: string): void {
    const el = ensureTooltipEl();
    const body = tooltipBody;
    if (!body) return;
    // Reset scroll so each open starts at the top of the content.
    el.scrollTop = 0;
    // Show the raw text immediately so the peek stays instant on the first
    // hover, when marked + KaTeX are still being fetched. The Markdown pass
    // below replaces it; if the import fails, this stays as the fallback.
    body.textContent = fullText;
    body.classList.add('gv-pm-tooltip-raw');
    el.setAttribute('data-gv-theme', panel.getAttribute('data-gv-theme') || '');
    positionTooltip(target);

    const token = ++tooltipRenderToken;
    void renderMarkdown(fullText)
      .then((html) => {
        // Stale render: the pointer moved to another row, or the preview was
        // dismissed while marked was loading.
        if (html === null || token !== tooltipRenderToken || !tooltipEl) return;
        body.innerHTML = html;
        openTooltipLinksInNewTab(body);
        body.classList.remove('gv-pm-tooltip-raw');
        highlightTemplateVariables(body);
        positionTooltip(target);
      })
      .catch(() => {
        // Keep the plain-text fallback already on screen.
      });
  }

  function attach(target: HTMLElement, fullText: string): void {
    target.addEventListener('mouseenter', () => {
      tooltipTargetHovered = true;
      clearHideTimer();
      clearOpenTimer();
      tooltipOpenTimer = window.setTimeout(() => {
        tooltipOpenTimer = null;
        if (tooltipTargetHovered) showTooltip(target, fullText);
      }, TOOLTIP_OPEN_DELAY_MS);
    });
    target.addEventListener('mouseleave', () => {
      tooltipTargetHovered = false;
      // Cancel a pending open (user left before it showed) — otherwise give
      // them the grace window to cross onto the tooltip.
      if (tooltipOpenTimer !== null) {
        clearOpenTimer();
        actuallyHideTooltip();
        return;
      }
      scheduleHide();
    });
    // A click/press activates the prompt; dismiss the hover preview immediately.
    target.addEventListener('mousedown', actuallyHideTooltip);
  }

  // Dismiss on scroll or panel-wide events so the tooltip never ends up
  // orphaned when the list scrolls under it. Exception: scrolling *inside*
  // the tooltip itself (long prompts now paginate within max-height) must
  // keep it open — otherwise the interactive preview is useless.
  const onTooltipDismiss = (ev: Event) => {
    const t = ev.target as Node | null;
    if (tooltipEl && t && (t === tooltipEl || tooltipEl.contains(t))) return;
    actuallyHideTooltip();
  };
  for (const target of scrollTargets) {
    target.addEventListener('scroll', onTooltipDismiss, { passive: true, capture: true });
  }

  return {
    attach,
    hide: actuallyHideTooltip,
    // Cancel pending timers, remove the DOM element, and detach the
    // capture-phase scroll listeners. Without this, every re-init (SPA nav /
    // extension reload) would leak an orphan tooltip + listener.
    destroy() {
      actuallyHideTooltip();
      if (tooltipEl) {
        try {
          tooltipEl.remove();
        } catch {}
        tooltipEl = null;
        tooltipBody = null;
      }
      for (const target of scrollTargets) {
        try {
          target.removeEventListener('scroll', onTooltipDismiss, { capture: true });
        } catch {}
      }
    },
  };
}
