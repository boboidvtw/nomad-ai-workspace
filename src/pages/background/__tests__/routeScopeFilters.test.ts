import { describe, expect, it } from 'vitest';

import type { ForkNode, ForkNodesData } from '@/pages/content/fork/forkTypes';
import type { StarredMessage } from '@/pages/content/timeline/starredTypes';

import {
  filterForkNodesByRouteScope,
  filterStarredByRouteScope,
  matchesRouteScope,
} from '../routeScopeFilters';

const U0 = 'https://gemini.google.com/u/0/app/aaa';
const U1 = 'https://gemini.google.com/u/1/app/bbb';
const PLAIN = 'https://gemini.google.com/app/ccc';

const star = (conversationId: string, conversationUrl: string): StarredMessage => ({
  turnId: `t-${conversationId}`,
  content: 'c',
  conversationId,
  conversationUrl,
  starredAt: 1,
});

const fork = (
  conversationId: string,
  conversationUrl: string,
  forkGroupId: string,
  turnId = 't1',
): ForkNode => ({
  turnId,
  conversationId,
  conversationUrl,
  forkGroupId,
  forkIndex: 0,
  createdAt: 1,
});

describe('matchesRouteScope', () => {
  it('lets everything through when no account route is active', () => {
    expect(matchesRouteScope(U1, null)).toBe(true);
  });

  it('keeps URLs of the active account and URLs that name no account', () => {
    expect(matchesRouteScope(U1, '1')).toBe(true);
    expect(matchesRouteScope(PLAIN, '1')).toBe(true);
    expect(matchesRouteScope('not a url', '1')).toBe(true);
    expect(matchesRouteScope(U0, '1')).toBe(false);
  });
});

describe('filterStarredByRouteScope', () => {
  it('returns the data unchanged without an account route', () => {
    const data = { messages: { a: [star('a', U0)] } };
    expect(filterStarredByRouteScope(data, null)).toBe(data);
  });

  it('drops other accounts’ stars and conversations left with none', () => {
    const data = {
      messages: {
        a: [star('a', U0)],
        b: [star('b', U1), star('b', U0)],
        c: [star('c', PLAIN)],
      },
    };

    expect(filterStarredByRouteScope(data, '1')).toEqual({
      messages: { b: [star('b', U1)], c: [star('c', PLAIN)] },
    });
  });
});

describe('filterForkNodesByRouteScope', () => {
  it('returns the data unchanged without an account route', () => {
    const data: ForkNodesData = { nodes: {}, groups: {} };
    expect(filterForkNodesByRouteScope(data, null)).toBe(data);
  });

  it('keeps the active account’s nodes and rebuilds the groups from them alone', () => {
    const data: ForkNodesData = {
      nodes: {
        a: [fork('a', U0, 'g1')],
        b: [fork('b', U1, 'g1'), fork('b', U1, 'g1')],
        c: [fork('c', PLAIN, 'g2', 't9')],
      },
      groups: { g1: ['a:t1', 'b:t1'], g2: ['c:t9'], stale: ['x:y'] },
    };

    expect(filterForkNodesByRouteScope(data, '1')).toEqual({
      nodes: {
        b: [fork('b', U1, 'g1'), fork('b', U1, 'g1')],
        c: [fork('c', PLAIN, 'g2', 't9')],
      },
      groups: { g1: ['b:t1'], g2: ['c:t9'] },
    });
  });
});
