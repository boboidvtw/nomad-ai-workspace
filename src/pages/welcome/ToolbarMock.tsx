import React from 'react';

import { Check, Eye, Pin, Settings } from 'lucide-react';

import type { ToolbarPinBrowser } from '@/features/onboarding/toolbarPin';

const ACTION_ICON: Record<Exclude<ToolbarPinBrowser, 'unsupported'>, React.ReactNode> = {
  chrome: <Pin className="h-3.5 w-3.5" />,
  edge: <Eye className="h-3.5 w-3.5" />,
  firefox: <Settings className="h-3.5 w-3.5" />,
};

/**
 * Chrome's Extensions button is the Material Symbols "extension" glyph, not a
 * generic jigsaw piece; matching it lets the user recognise the real button.
 */
function ExtensionsGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
      <path d="M8.8 21H5q-.825 0-1.413-.588T3 19v-3.8q1.2 0 2.1-.763T6 12.5q0-1.175-.9-1.937T3 9.8V6q0-.825.588-1.413T5 4h4q0-1.05.725-1.775T11.5 1.5q1.05 0 1.775.725T14 4h4q.825 0 1.413.588T20 6v4q1.05 0 1.775.725T22.5 12.5q0 1.05-.725 1.775T20 15v4q0 .825-.588 1.413T18 21h-3.8q0-1.25-.788-2.125T11.5 18q-1.125 0-1.912.875T8.8 21ZM5 19h2.3q.625-1.5 1.813-2.25T11.5 16q1.2 0 2.388.75T15.7 19H18v-6h2q.225 0 .363-.138T20.5 12.5q0-.225-.137-.363T20 12h-2V6h-6V4q0-.225-.137-.363T11.5 3.5q-.225 0-.363.138T11 4v2H5v2.2q1.35.5 2.175 1.675T8 12.5q0 1.425-.825 2.6T5 16.8V19Zm6.5-6.5Z" />
    </svg>
  );
}

interface ToolbarMockProps {
  browser: Exclude<ToolbarPinBrowser, 'unsupported'>;
  pinned: boolean;
}

/**
 * A miniature of the browser chrome: address bar, extensions button and the
 * extensions menu with Voyager's row. Once the real toolbar reports the pin,
 * the menu folds away and Voyager's icon appears next to the button, so the
 * mock shows the user what just changed above the page.
 */
export function ToolbarMock({ browser, pinned }: ToolbarMockProps) {
  return (
    <div
      aria-hidden="true"
      className="bg-secondary/50 relative h-[148px] overflow-hidden rounded-xl select-none"
    >
      <div className="bg-card border-border/60 relative flex h-11 items-center gap-2 border-b px-3">
        <div className="flex gap-1.5">
          <span className="bg-border h-2.5 w-2.5 rounded-full" />
          <span className="bg-border h-2.5 w-2.5 rounded-full" />
          <span className="bg-border h-2.5 w-2.5 rounded-full" />
        </div>
        <div className="bg-secondary ms-2 h-6 flex-1 rounded-full" />
        <div className="relative flex h-7 w-7 items-center justify-center">
          <img
            src="/icon-32.png"
            alt=""
            width={20}
            height={20}
            className={[
              'gv-welcome-fade absolute rounded-md',
              pinned ? 'scale-100 opacity-100 blur-0' : 'scale-50 opacity-0 blur-[4px]',
            ].join(' ')}
          />
          <span
            className={[
              'gv-welcome-fade bg-primary text-primary-foreground absolute -top-0.5 -end-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full',
              pinned ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
            ].join(' ')}
          >
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        </div>
        <div
          className={[
            'bg-secondary text-foreground/80 relative flex h-7 w-7 items-center justify-center rounded-full',
            pinned ? '' : 'gv-welcome-ring',
          ].join(' ')}
        >
          <ExtensionsGlyph />
        </div>
      </div>

      <div
        className={[
          'gv-welcome-fade bg-card border-border/60 absolute top-12 end-3 w-52 rounded-lg border p-1.5 shadow-md',
          pinned ? 'pointer-events-none -translate-y-1 opacity-0' : 'translate-y-0 opacity-100',
        ].join(' ')}
      >
        <div className="bg-accent flex items-center gap-2 rounded-md px-2 py-1.5">
          <img src="/icon-32.png" alt="" width={16} height={16} className="rounded" />
          <span className="text-foreground flex-1 text-xs font-semibold">Voyager</span>
          <span className="text-primary relative flex h-5 w-5 items-center justify-center">
            {ACTION_ICON[browser]}
          </span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="bg-border h-4 w-4 rounded" />
          <span className="bg-border h-2 w-20 rounded-full" />
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <span className="bg-border h-4 w-4 rounded" />
          <span className="bg-border h-2 w-14 rounded-full" />
        </div>
      </div>
    </div>
  );
}
