/* The delete confirmation that hangs off a prompt row.
 *
 * One instance at a time, dismissed by an outside press, Escape, or a scroll
 * underneath. Escape is taken in the capture phase so answering the popover
 * does not also close the panel behind it.
 */

export type ConfirmRequest = {
  /** The control the popover points at; also where focus returns. */
  anchor: HTMLElement;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
};

export type PromptRowSurfaces = {
  openConfirm: (request: ConfirmRequest) => void;
  isOpen: () => boolean;
  close: () => void;
  destroy: () => void;
};

const VIEWPORT_PAD = 8;
/** Matches the confirmation's own width budget when deciding which side to open on. */
const CONFIRM_WIDTH_ESTIMATE = 220;

export function createPromptRowSurfaces(): PromptRowSurfaces {
  let open: { el: HTMLElement; restoreFocus: HTMLElement | null; release: () => void } | null =
    null;

  function close(): void {
    if (!open) return;
    const current = open;
    open = null;
    current.release();
    current.el.remove();
    // Only pull focus back if the surface still owns it; a click elsewhere has
    // already moved it somewhere the user chose.
    if (current.restoreFocus?.isConnected && !document.activeElement?.closest('input, textarea')) {
      current.restoreFocus.focus({ preventScroll: true });
    }
  }

  function mount(el: HTMLElement, restoreFocus: HTMLElement | null): void {
    close();
    document.body.appendChild(el);

    const onOutside = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (target?.closest('.gv-pm-confirm')) return;
      close();
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      // Capture phase: dismissing the popover must not also close the panel.
      ev.preventDefault();
      ev.stopPropagation();
      close();
    };
    const onScroll = () => close();

    window.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('click', onOutside, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);

    open = {
      el,
      restoreFocus,
      release: () => {
        window.removeEventListener('pointerdown', onOutside, true);
        window.removeEventListener('click', onOutside, true);
        window.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onScroll);
      },
    };
  }

  function openConfirm(request: ConfirmRequest): void {
    const pop = document.createElement('div');
    pop.className = 'gv-pm-confirm';

    const message = document.createElement('span');
    message.textContent = request.message;
    const confirm = document.createElement('button');
    confirm.className = 'gv-pm-confirm-yes';
    confirm.textContent = request.confirmLabel;
    const cancel = document.createElement('button');
    cancel.textContent = request.cancelLabel;
    pop.append(message, confirm, cancel);

    cancel.addEventListener('click', (ev) => {
      ev.stopPropagation();
      close();
    });
    confirm.addEventListener('click', (ev) => {
      ev.stopPropagation();
      close();
      request.onConfirm();
    });

    mount(pop, request.anchor);

    const anchorRect = request.anchor.getBoundingClientRect();
    const side: 'left' | 'right' =
      anchorRect.right + CONFIRM_WIDTH_ESTIMATE > window.innerWidth ? 'left' : 'right';
    const top = Math.max(VIEWPORT_PAD, anchorRect.top + window.scrollY - 6);
    const left =
      side === 'right'
        ? anchorRect.right + window.scrollX + 10
        : anchorRect.left + window.scrollX - pop.offsetWidth - 10;
    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(Math.max(VIEWPORT_PAD, left))}px`;
    pop.setAttribute('data-side', side);

    confirm.focus({ preventScroll: true });
  }

  return {
    openConfirm,
    isOpen: () => open !== null,
    close,
    destroy: close,
  };
}
