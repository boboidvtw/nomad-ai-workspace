export const DRIVE_FOLDER_NAME: "Nomad Workspace Data";
export const WORKSPACES_FILE_NAME: "nomad-workspaces.json";
export const SETTINGS_FILE_NAME: "nomad-settings.json";
export const MANIFEST_FILE_NAME: "nomad-sync-manifest.json";
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
 * Export workspaces & settings to Google Drive folder (Push)
 * @param {Object} [options]
 * @param {Array<Object>} [options.workspaces] - List of workspaces (required; validated at runtime)
 * @param {Object} [options.settings] - App settings
 * @param {string} [options.targetDir] - Custom Drive directory override
 * @returns {import('../result').UnitResult<{ targetDir: string, syncedCount: number, checksum: string, timestamp: string }>}
 */
export function exportToDrive(options?: {
    workspaces?: any[] | undefined;
    settings?: any;
    targetDir?: string | undefined;
}): import("../result").UnitResult<{
    targetDir: string;
    syncedCount: number;
    checksum: string;
    timestamp: string;
}>;
/**
 * Import workspaces from Google Drive folder (Pull) with reconciliation strategy
 * @param {Object} options
 * @param {Array<Object>} [options.currentWorkspaces=[]] - Existing local workspaces
 * @param {string} [options.sourceDir] - Custom Drive directory override
 * @param {'merge'|'overwrite'|'keep_local'} [options.strategy='merge']
 * @returns {import('../result').UnitResult<{ reconciledWorkspaces: Array<Object>, importedCount: number, strategy: string, timestamp: string }>}
 */
export function importFromDrive(options?: {
    currentWorkspaces?: any[] | undefined;
    sourceDir?: string | undefined;
    strategy?: "merge" | "overwrite" | "keep_local" | undefined;
}): import("../result").UnitResult<{
    reconciledWorkspaces: Array<any>;
    importedCount: number;
    strategy: string;
    timestamp: string;
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
