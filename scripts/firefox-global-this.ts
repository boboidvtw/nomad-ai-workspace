import type { Plugin } from 'vite';

// lodash-es (bundled into Mermaid's dagre, cytoscape and cynefin chunks) finds the global object
// with `freeGlobal || freeSelf || Function("return this")()`. In a Firefox content script `self`
// is an Xray-wrapped page window, so `self.Object === Object` is false and lodash falls through to
// Function(), which the extension CSP blocks. The dagre layout chunk then fails to load and every
// Mermaid flowchart breaks. globalThis is the same object and needs no eval.
const FUNCTION_GLOBAL_LOOKUP = /Function\(\s*(["'])return this\1\s*\)\(\s*\)/g;

export function replaceFunctionGlobalLookup(code: string): string | null {
  const replaced = code.replace(FUNCTION_GLOBAL_LOOKUP, 'globalThis');
  return replaced === code ? null : replaced;
}

export function firefoxGlobalThisPlugin(): Plugin {
  return {
    name: 'voyager-firefox-global-this',
    renderChunk(code) {
      const replaced = replaceFunctionGlobalLookup(code);
      return replaced === null ? null : { code: replaced, map: null };
    },
  };
}
