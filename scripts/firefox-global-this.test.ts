import { describe, expect, it } from 'vitest';

import { firefoxGlobalThisPlugin, replaceFunctionGlobalLookup } from './firefox-global-this';

// The exact shape lodash-es ships inside Mermaid's dagre, cytoscape and cynefin chunks.
const LODASH_ROOT =
  'pt=typeof self=="object"&&self&&self.Object===Object&&self,w=Ze||pt||Function("return this")(),y=w.Symbol';

describe('replaceFunctionGlobalLookup', () => {
  it('replaces the lodash Function() global lookup with globalThis', () => {
    expect(replaceFunctionGlobalLookup(LODASH_ROOT)).toBe(
      'pt=typeof self=="object"&&self&&self.Object===Object&&self,w=Ze||pt||globalThis,y=w.Symbol',
    );
  });

  it('handles single quotes, spacing and repeated occurrences', () => {
    expect(
      replaceFunctionGlobalLookup('a=Function(\'return this\')();b=Function( "return this" )( );'),
    ).toBe('a=globalThis;b=globalThis;');
  });

  it('returns null when there is nothing to replace', () => {
    expect(replaceFunctionGlobalLookup('const f = new Function("a", "return a");')).toBeNull();
    expect(replaceFunctionGlobalLookup('Function("return this")')).toBeNull();
  });
});

describe('firefoxGlobalThisPlugin', () => {
  it('rewrites rendered chunks and leaves untouched chunks alone', () => {
    const plugin = firefoxGlobalThisPlugin();
    const renderChunk = plugin.renderChunk as (code: string) => { code: string } | null;

    expect(renderChunk('w=pt||Function("return this")()')).toEqual({
      code: 'w=pt||globalThis',
      map: null,
    });
    expect(renderChunk('const x = 1;')).toBeNull();
  });
});
