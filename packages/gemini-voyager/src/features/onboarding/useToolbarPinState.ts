import { useEffect, useMemo, useState } from 'react';

import {
  type ToolbarPinBrowser,
  detectToolbarPinBrowser,
  watchToolbarPinState,
} from './toolbarPin';

export interface ToolbarPinState {
  browser: ToolbarPinBrowser;
  /** `false` until the first read resolves; avoids a flash of the wrong state. */
  ready: boolean;
  /** `null` when the browser cannot report it. */
  pinned: boolean | null;
}

export function useToolbarPinState(): ToolbarPinState {
  const browser = useMemo(() => detectToolbarPinBrowser(), []);
  const [state, setState] = useState<{ ready: boolean; pinned: boolean | null }>({
    ready: false,
    pinned: null,
  });

  useEffect(() => {
    if (browser === 'unsupported') {
      setState({ ready: true, pinned: null });
      return;
    }
    return watchToolbarPinState((pinned) => setState({ ready: true, pinned }));
  }, [browser]);

  return { browser, ready: state.ready, pinned: state.pinned };
}
