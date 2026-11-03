/**
 * Narrows synced starred messages and fork nodes to the Google account route (`/u/<n>/`) the
 * request came from. Entries whose URL names no account stay visible in every route.
 */
import { extractRouteUserIdFromUrl } from '@/core/services/AccountIsolationService';
import type { ForkNode, ForkNodesData } from '@/pages/content/fork/forkTypes';
import type { StarredMessagesData } from '@/pages/content/timeline/starredTypes';

export function matchesRouteScope(url: string, routeUserId: string | null): boolean {
  if (!routeUserId) return true;
  const routeFromUrl = extractRouteUserIdFromUrl(url);
  return routeFromUrl === null || routeFromUrl === routeUserId;
}

export function filterStarredByRouteScope(
  data: StarredMessagesData,
  routeUserId: string | null,
): StarredMessagesData {
  if (!routeUserId) return data;

  const filteredEntries = Object.entries(data.messages).map(([conversationId, messages]) => {
    const filteredMessages = messages.filter((message) =>
      matchesRouteScope(message.conversationUrl, routeUserId),
    );
    return [conversationId, filteredMessages] as const;
  });

  const filteredMessages = Object.fromEntries(
    filteredEntries.filter((entry) => entry[1].length > 0),
  );
  return { messages: filteredMessages };
}

export function filterForkNodesByRouteScope(
  data: ForkNodesData,
  routeUserId: string | null,
): ForkNodesData {
  if (!routeUserId) return data;

  const filteredNodes: Record<string, ForkNode[]> = {};
  for (const [conversationId, nodes] of Object.entries(data.nodes)) {
    const filtered = nodes.filter((node) => matchesRouteScope(node.conversationUrl, routeUserId));
    if (filtered.length > 0) {
      filteredNodes[conversationId] = filtered;
    }
  }

  const filteredGroups: Record<string, string[]> = {};
  for (const nodes of Object.values(filteredNodes)) {
    for (const node of nodes) {
      if (!filteredGroups[node.forkGroupId]) {
        filteredGroups[node.forkGroupId] = [];
      }
      const key = `${node.conversationId}:${node.turnId}`;
      if (!filteredGroups[node.forkGroupId].includes(key)) {
        filteredGroups[node.forkGroupId].push(key);
      }
    }
  }

  return {
    nodes: filteredNodes,
    groups: filteredGroups,
  };
}
