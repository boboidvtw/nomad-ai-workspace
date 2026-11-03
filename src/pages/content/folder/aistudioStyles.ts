/** The AI Studio-only folder styles; the shared palette lives in public/contentStyle.css. */
export const AISTUDIO_FOLDER_STYLE_ID = 'gv-aistudio-folder-styles';

export function injectAIStudioFolderStyles(): void {
  const styleId = AISTUDIO_FOLDER_STYLE_ID;
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    /* AI Studio is a predominantly dark surface; tuned for low contrast so the
       confirm dialog reads as a subtle elevated card, not a bright pop-out. */
    .gv-folder-confirm-dialog.gv-aistudio-confirm {
      background: var(--mat-sys-surface-container-high, #2d2e30);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      padding: 16px;
      min-width: 280px;
      font-family: 'Google Sans', 'Segoe UI', sans-serif;
      animation: gv-fade-in 0.2s ease-out;
      color: var(--mat-sys-on-surface, #e3e3e3);
    }

    .gv-folder-confirm-dialog.gv-aistudio-confirm .gv-confirm-message {
      margin-bottom: 16px;
      color: var(--mat-sys-on-surface, #e3e3e3);
      font-size: 14px;
      line-height: 1.5;
      font-weight: 400;
      opacity: 0.92;
    }

    .gv-folder-confirm-dialog.gv-aistudio-confirm .gv-confirm-actions {
      display: flex;
      gap: 4px;
      justify-content: flex-end;
    }

    .gv-folder-confirm-dialog.gv-aistudio-confirm .gv-confirm-btn {
      padding: 6px 14px;
      border-radius: 999px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s ease;
      border: none;
      outline: none;
      background: transparent;
    }

    /* Destructive action: filled but muted — use the token-scaled error tone when
       available, otherwise a desaturated red that sits quietly on dark surfaces. */
    .gv-folder-confirm-dialog.gv-aistudio-confirm .gv-confirm-delete {
      background-color: var(--mat-sys-error-container, rgba(220, 90, 90, 0.22));
      color: var(--mat-sys-on-error-container, #f5b8b3);
      box-shadow: none;
    }

    .gv-folder-confirm-dialog.gv-aistudio-confirm .gv-confirm-delete:hover {
      background-color: rgba(220, 90, 90, 0.32);
      color: #ffd3cf;
      box-shadow: none;
    }

    /* Cancel is a borderless text button — removes the framing that fought the Delete fill. */
    .gv-folder-confirm-dialog.gv-aistudio-confirm .gv-confirm-cancel {
      background-color: transparent;
      color: var(--mat-sys-on-surface-variant, #c4c7c5);
      border: none;
    }

    .gv-folder-confirm-dialog.gv-aistudio-confirm .gv-confirm-cancel:hover {
      background-color: rgba(255, 255, 255, 0.06);
      color: var(--mat-sys-on-surface, #e3e3e3);
    }

    /* Hover effect for remove button in list */
    .gv-aistudio .gv-conversation-remove-btn:hover {
      background-color: rgba(220, 90, 90, 0.14) !important;
      color: #e69892 !important;
    }

    .gv-aistudio .gv-conversation-remove-btn:hover span {
      font-variation-settings: 'FILL' 1, 'wght' 600 !important;
    }

    @keyframes gv-fade-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}
