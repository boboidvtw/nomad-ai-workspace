/**
 * A workspace record as synced to Drive; only `id` and `updatedAt` are interpreted here.
 */
export type SyncWorkspace = {
    id?: string;
    updatedAt?: string;
} & Record<string, unknown>;
export const DRIVE_FOLDER_NAME: "Nomad Workspace Data";
export const WORKSPACES_FILE_NAME: "nomad-workspaces.json";
export const SETTINGS_FILE_NAME: "nomad-settings.json";
export const MANIFEST_FILE_NAME: "nomad-sync-manifest.json";
export const BOTS_FILE_NAME: "nomad-bots.json";
/**
 * Detect local Google Drive mounted paths on macOS / Linux / Windows
 * @returns {string|null} Resolved full path or null
 */
export function detectLocalDriveFolder(): string | null;
/**
 * Compute SHA256 checksum for content consistency verification
 * @param {string} content
 * @returns {string}
 */
export function computeChecksum(content: string): string;
/**
 * A workspace record as synced to Drive; only `id` and `updatedAt` are interpreted here.
 * @typedef {{ id?: string, updatedAt?: string } & Record<string, unknown>} SyncWorkspace
 */
/**
 * Export workspaces & settings to Google Drive folder (Push)
 * @param {Object} [options]
 * @param {SyncWorkspace[]} [options.workspaces] - List of workspaces (required; validated at runtime)
 * @param {Record<string, unknown>} [options.settings] - App settings
 * @param {string} [options.targetDir] - Custom Drive directory override
 * @param {{ version: number, bots: unknown[] }} [options.bots] - BotRoster.toSyncPayload() (no chat URLs)
 * @returns {import('../result').UnitResult<{ targetDir: string, syncedCount: number, checksum: string, timestamp: string }>}
 */
export function exportToDrive(options?: {
    workspaces?: SyncWorkspace[] | undefined;
    settings?: Record<string, unknown> | undefined;
    targetDir?: string | undefined;
    bots?: {
        version: number;
        bots: unknown[];
    } | undefined;
}): import("../result").UnitResult<{
    targetDir: string;
    syncedCount: number;
    checksum: string;
    timestamp: string;
}>;
/**
 * Import workspaces from Google Drive folder (Pull) with reconciliation strategy
 * @param {Object} [options]
 * @param {SyncWorkspace[]} [options.currentWorkspaces=[]] - Existing local workspaces
 * @param {string} [options.sourceDir] - Custom Drive directory override
 * @param {'merge'|'overwrite'|'keep_local'} [options.strategy='merge']
 * @returns {import('../result').UnitResult<{ reconciledWorkspaces: SyncWorkspace[], importedCount: number, strategy: string, timestamp: string, bots: { version?: number, bots?: unknown[] } | null }>}
 */
export function importFromDrive(options?: {
    currentWorkspaces?: SyncWorkspace[] | undefined;
    sourceDir?: string | undefined;
    strategy?: "merge" | "overwrite" | "keep_local" | undefined;
}): import("../result").UnitResult<{
    reconciledWorkspaces: SyncWorkspace[];
    importedCount: number;
    strategy: string;
    timestamp: string;
    bots: {
        version?: number;
        bots?: unknown[];
    } | null;
}>;
/**
 * Get Google Drive sync status and health
 * @param {Object} [options]
 * @param {string} [options.targetDir]
 * @returns {import('../result').UnitResult<{ status: 'connected'|'not_found', targetDir: string, lastSyncedAt: string|null, workspaceCount: number, checksum: string|null }>}
 */
export function getSyncStatus(options?: {
    targetDir?: string | undefined;
}): import("../result").UnitResult<{
    status: "connected" | "not_found";
    targetDir: string;
    lastSyncedAt: string | null;
    workspaceCount: number;
    checksum: string | null;
}>;
