/**
 * Sync deletion tombstones.
 *
 * Merges are unions, so without a record of deletions an item removed on one
 * device comes back from the other copy on the next merge. A tombstone maps a
 * namespaced item id to the time it was deleted. Every sync applies the
 * tombstones to both the local and the cloud copy before merging, so a deleted
 * item stays deleted. An item edited (or re-added) after its deletion time wins
 * over the tombstone.
 *
 * Id namespaces:
 * - `folder:<folderId>`                  a folder (Gemini tree or flat platform folder)
 * - `conv:<folderId>/<conversationId>`   a conversation's membership in a folder
 * - `prompt:<promptId>`                  a prompt
 * - `star:<conversationId>/<turnId>`     a starred message
 */

export type Tombstones = Record<string, number>;

export const TOMBSTONE_FILE_FORMAT = 'nomad.sync.tombstones.v1';
export const TOMBSTONE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

/** Cloud copy of every dataset's tombstones, keyed by the local storage key. */
export interface TombstoneFile {
  format: typeof TOMBSTONE_FILE_FORMAT;
  datasets: Record<string, Tombstones>;
}

type FolderLike = { id: string; parentId?: string | null; updatedAt?: number; createdAt?: number };
type ConversationLike = { conversationId: string; addedAt?: number };
type FolderDataLike<F extends FolderLike, C extends ConversationLike> = {
  folders: F[];
  folderContents: Record<string, C[]>;
};
type FlatFolderLike = {
  id: string;
  conversationIds?: string[];
  updatedAt?: number;
  createdAt?: number;
};
type PromptLike = { id: string; updatedAt?: number; createdAt?: number };
type StarredLike = { turnId: string; starredAt?: number };

const folderId = (id: string) => `folder:${id}`;
const membershipId = (folder: string, conversation: string) => `conv:${folder}/${conversation}`;
const promptId = (id: string) => `prompt:${id}`;
const starId = (conversation: string, turn: string) => `star:${conversation}/${turn}`;

/**
 * True when the tombstone for `id` is at least as new as the item.
 * Items without a timestamp count as older than any deletion.
 */
function isDeleted(tombstones: Tombstones, id: string, itemTime: number | undefined): boolean {
  const deletedAt = tombstones[id];
  return deletedAt !== undefined && deletedAt >= (itemTime ?? 0);
}

/** Mark ids that disappeared between two snapshots; clear marks for ids that came back. */
export function recordRemovedIds(
  previousIds: Iterable<string>,
  nextIds: Iterable<string>,
  existing: Tombstones,
  now: number,
): Tombstones {
  const previous = new Set(previousIds);
  const next = new Set(nextIds);
  const result: Tombstones = { ...existing };
  previous.forEach((id) => {
    if (!next.has(id)) result[id] = now;
  });
  next.forEach((id) => {
    if (!previous.has(id)) delete result[id];
  });
  return result;
}

export function mergeTombstones(...sets: Array<Tombstones | null | undefined>): Tombstones {
  const result: Tombstones = {};
  sets.forEach((set) => {
    if (!set) return;
    Object.entries(set).forEach(([id, deletedAt]) => {
      result[id] = Math.max(result[id] ?? 0, deletedAt);
    });
  });
  return result;
}

export function pruneTombstones(
  tombstones: Tombstones,
  now: number,
  maxAgeMs: number = TOMBSTONE_MAX_AGE_MS,
): Tombstones {
  return Object.fromEntries(
    Object.entries(tombstones).filter(([, deletedAt]) => now - deletedAt <= maxAgeMs),
  );
}

export function applyTombstonesToPrompts<P extends PromptLike>(
  prompts: P[],
  tombstones: Tombstones,
): P[] {
  return prompts.filter(
    (prompt) => !isDeleted(tombstones, promptId(prompt.id), prompt.updatedAt ?? prompt.createdAt),
  );
}

export function applyTombstonesToFolderData<F extends FolderLike, C extends ConversationLike>(
  data: FolderDataLike<F, C>,
  tombstones: Tombstones,
): FolderDataLike<F, C> {
  const kept = data.folders.filter(
    (folder) => !isDeleted(tombstones, folderId(folder.id), folder.updatedAt ?? folder.createdAt),
  );
  const keptIds = new Set(kept.map((folder) => folder.id));
  const folders = kept.map((folder) =>
    folder.parentId && !keptIds.has(folder.parentId) ? { ...folder, parentId: null } : folder,
  );

  const folderContents: Record<string, C[]> = {};
  Object.entries(data.folderContents).forEach(([id, conversations]) => {
    if (!keptIds.has(id) && tombstones[folderId(id)] !== undefined) return;
    folderContents[id] = conversations.filter(
      (conversation) =>
        !isDeleted(tombstones, membershipId(id, conversation.conversationId), conversation.addedAt),
    );
  });

  return { folders, folderContents };
}

export function applyTombstonesToFlatFolders<F extends FlatFolderLike>(
  folders: F[],
  tombstones: Tombstones,
): F[] {
  return folders
    .filter(
      (folder) => !isDeleted(tombstones, folderId(folder.id), folder.updatedAt ?? folder.createdAt),
    )
    .map((folder) =>
      Array.isArray(folder.conversationIds)
        ? {
            ...folder,
            conversationIds: folder.conversationIds.filter(
              (conversation) => tombstones[membershipId(folder.id, conversation)] === undefined,
            ),
          }
        : folder,
    );
}

export function applyTombstonesToStarred<S extends StarredLike>(
  data: { messages: Record<string, S[]> },
  tombstones: Tombstones,
): { messages: Record<string, S[]> } {
  const messages: Record<string, S[]> = {};
  Object.entries(data.messages).forEach(([conversation, list]) => {
    const kept = list.filter(
      (message) => !isDeleted(tombstones, starId(conversation, message.turnId), message.starredAt),
    );
    if (kept.length > 0) messages[conversation] = kept;
  });
  return { messages };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function idsFromFolderData(value: Record<string, unknown>): string[] {
  const ids: string[] = [];
  (value.folders as unknown[]).forEach((folder) => {
    if (isRecord(folder) && typeof folder.id === 'string') ids.push(folderId(folder.id));
  });
  Object.entries(value.folderContents as Record<string, unknown>).forEach(([id, list]) => {
    if (!Array.isArray(list)) return;
    list.forEach((conversation) => {
      if (isRecord(conversation) && typeof conversation.conversationId === 'string') {
        ids.push(membershipId(id, conversation.conversationId));
      }
    });
  });
  return ids;
}

function idsFromList(list: unknown[]): string[] {
  const ids: string[] = [];
  list.forEach((item) => {
    if (!isRecord(item) || typeof item.id !== 'string') return;
    // Flat platform folders carry conversationIds; prompts carry text.
    if (Array.isArray(item.conversationIds) || typeof item.text !== 'string') {
      ids.push(folderId(item.id));
      (Array.isArray(item.conversationIds) ? item.conversationIds : []).forEach((conversation) => {
        if (typeof conversation === 'string')
          ids.push(membershipId(item.id as string, conversation));
      });
      return;
    }
    ids.push(promptId(item.id));
  });
  return ids;
}

function idsFromStarred(messages: Record<string, unknown>): string[] {
  const ids: string[] = [];
  Object.entries(messages).forEach(([conversation, list]) => {
    if (!Array.isArray(list)) return;
    list.forEach((message) => {
      if (isRecord(message) && typeof message.turnId === 'string') {
        ids.push(starId(conversation, message.turnId));
      }
    });
  });
  return ids;
}

/** Every tracked id in a stored value, whatever synced shape it has. Unknown shapes yield []. */
export function collectTrackedIds(value: unknown): string[] {
  if (Array.isArray(value)) return idsFromList(value);
  if (!isRecord(value)) return [];
  if (Array.isArray(value.folders) && isRecord(value.folderContents)) {
    return idsFromFolderData(value);
  }
  if (isRecord(value.messages)) return idsFromStarred(value.messages);
  return [];
}

export function isTombstoneFile(value: unknown): value is TombstoneFile {
  if (!isRecord(value) || value.format !== TOMBSTONE_FILE_FORMAT || !isRecord(value.datasets)) {
    return false;
  }
  return Object.values(value.datasets).every(
    (set) =>
      isRecord(set) &&
      Object.values(set).every((time) => typeof time === 'number' && Number.isFinite(time)),
  );
}
