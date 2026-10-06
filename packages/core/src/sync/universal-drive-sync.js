/**
 * Universal Google Drive Sync Module
 * Governed by AGENTS.md Section 6: Atomic Contract & Zero Exception Protocol
 * Supports macOS local Google Drive directory auto-detection and two-way sync.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { ok, err } = require('../result');
const { ErrorCodes } = require('../error-codes');

const DRIVE_FOLDER_NAME = 'Nomad Workspace Data';
const WORKSPACES_FILE_NAME = 'nomad-workspaces.json';
const SETTINGS_FILE_NAME = 'nomad-settings.json';
const MANIFEST_FILE_NAME = 'nomad-sync-manifest.json';

/**
 * Detect local Google Drive mounted paths on macOS / Linux / Windows
 * @returns {string|null} Resolved full path or null
 */
function detectLocalDriveFolder() {
  const home = os.homedir();
  const candidates = [
    // Standard macOS Google Drive directory
    path.join(home, 'Google Drive', 'My Drive'),
    path.join(home, 'Google Drive: My Drive'),
    path.join(home, 'Google Drive'),
    // macOS CloudStorage container
    path.join(home, 'Library', 'CloudStorage')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      if (c.endsWith('CloudStorage')) {
        // Look for GoogleDrive subfolders inside CloudStorage
        try {
          const entries = fs.readdirSync(c);
          const driveEntry = entries.find(e => e.startsWith('GoogleDrive-'));
          if (driveEntry) {
            const myDrive = path.join(c, driveEntry, 'My Drive');
            if (fs.existsSync(myDrive)) return path.join(myDrive, DRIVE_FOLDER_NAME);
            return path.join(c, driveEntry, DRIVE_FOLDER_NAME);
          }
        } catch {}
      } else {
        return path.join(c, DRIVE_FOLDER_NAME);
      }
    }
  }

  // Fallback to local user application documents directory for offline/local simulation
  return path.join(home, '.nomad-drive-backup', DRIVE_FOLDER_NAME);
}

/**
 * Compute SHA256 checksum for content consistency verification
 * @param {string} content
 * @returns {string}
 */
function computeChecksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex').substring(0, 16);
}

/**
 * Export workspaces & settings to Google Drive folder (Push)
 * @param {Object} [options]
 * @param {Array<Object>} [options.workspaces] - List of workspaces (required; validated at runtime)
 * @param {Object} [options.settings] - App settings
 * @param {string} [options.targetDir] - Custom Drive directory override
 * @returns {import('../result').UnitResult<{ targetDir: string, syncedCount: number, checksum: string, timestamp: string }>}
 */
function exportToDrive(options = {}) {
  try {
    const workspaces = options.workspaces || [];
    if (!Array.isArray(workspaces)) {
      return err(ErrorCodes.SYNC_INVALID_PAYLOAD_006, 'Workspaces payload must be an array');
    }

    const targetDir = options.targetDir || detectLocalDriveFolder();
    if (!targetDir) {
      return err(ErrorCodes.SYNC_DRIVE_FOLDER_NOT_FOUND_001, 'No valid Google Drive directory found');
    }

    // Ensure directory exists
    fs.mkdirSync(targetDir, { recursive: true });

    // 1. Serialize Workspaces
    const workspacesJson = JSON.stringify({
      version: '1.4.0',
      exportedAt: new Date().toISOString(),
      workspaceCount: workspaces.length,
      workspaces
    }, null, 2);

    const workspacesPath = path.join(targetDir, WORKSPACES_FILE_NAME);
    fs.writeFileSync(workspacesPath, workspacesJson, 'utf8');

    // 2. Serialize Settings if provided
    if (options.settings && typeof options.settings === 'object') {
      const settingsPath = path.join(targetDir, SETTINGS_FILE_NAME);
      fs.writeFileSync(settingsPath, JSON.stringify(options.settings, null, 2), 'utf8');
    }

    // 3. Write Sync Manifest
    const checksum = computeChecksum(workspacesJson);
    const manifest = {
      schemaVersion: '1.0.0',
      lastSyncedAt: new Date().toISOString(),
      workspaceCount: workspaces.length,
      checksum,
      files: [WORKSPACES_FILE_NAME, SETTINGS_FILE_NAME]
    };
    fs.writeFileSync(path.join(targetDir, MANIFEST_FILE_NAME), JSON.stringify(manifest, null, 2), 'utf8');

    return ok({
      targetDir,
      syncedCount: workspaces.length,
      checksum,
      timestamp: manifest.lastSyncedAt
    });
  } catch (e) {
    return err(
      ErrorCodes.SYNC_DRIVE_UPLOAD_FAILED_003,
      'Google Drive push failed: ' + (e instanceof Error ? e.message : String(e))
    );
  }
}

/**
 * Import workspaces from Google Drive folder (Pull) with reconciliation strategy
 * @param {Object} options
 * @param {Array<Object>} [options.currentWorkspaces=[]] - Existing local workspaces
 * @param {string} [options.sourceDir] - Custom Drive directory override
 * @param {'merge'|'overwrite'|'keep_local'} [options.strategy='merge']
 * @returns {import('../result').UnitResult<{ reconciledWorkspaces: Array<Object>, importedCount: number, strategy: string, timestamp: string }>}
 */
function importFromDrive(options = {}) {
  try {
    const sourceDir = options.sourceDir || detectLocalDriveFolder();
    if (!sourceDir || !fs.existsSync(sourceDir)) {
      return err(ErrorCodes.SYNC_DRIVE_FOLDER_NOT_FOUND_001, 'Google Drive backup folder does not exist');
    }

    const workspacesPath = path.join(sourceDir, WORKSPACES_FILE_NAME);
    if (!fs.existsSync(workspacesPath)) {
      return err(ErrorCodes.SYNC_DRIVE_DOWNLOAD_FAILED_004, 'Remote workspaces file not found in Drive directory');
    }

    const raw = fs.readFileSync(workspacesPath, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return err(ErrorCodes.SYNC_INVALID_PAYLOAD_006, 'Corrupt workspaces JSON in Drive: ' + e.message);
    }

    const driveWorkspaces = Array.isArray(parsed) ? parsed : (parsed.workspaces || []);
    const localWorkspaces = Array.isArray(options.currentWorkspaces) ? [...options.currentWorkspaces] : [];
    const strategy = options.strategy || 'merge';

    let reconciled = [];

    if (strategy === 'overwrite') {
      reconciled = [...driveWorkspaces];
    } else if (strategy === 'keep_local') {
      reconciled = [...localWorkspaces];
      for (const dw of driveWorkspaces) {
        if (!reconciled.some(lw => lw.id === dw.id)) {
          reconciled.push(dw);
        }
      }
    } else {
      // 'merge': Reconcile based on latest updatedAt timestamp
      const map = new Map();
      for (const lw of localWorkspaces) {
        if (lw.id) map.set(lw.id, lw);
      }

      for (const dw of driveWorkspaces) {
        if (!dw.id) continue;
        if (!map.has(dw.id)) {
          map.set(dw.id, dw);
        } else {
          const existing = map.get(dw.id);
          const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
          const driveTime = dw.updatedAt ? new Date(dw.updatedAt).getTime() : 0;

          if (driveTime >= existingTime) {
            map.set(dw.id, { ...existing, ...dw });
          }
        }
      }
      reconciled = Array.from(map.values());
    }

    return ok({
      reconciledWorkspaces: reconciled,
      importedCount: driveWorkspaces.length,
      strategy,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    return err(
      ErrorCodes.SYNC_DRIVE_DOWNLOAD_FAILED_004,
      'Google Drive pull failed: ' + (e instanceof Error ? e.message : String(e))
    );
  }
}

/**
 * Get Google Drive sync status and health
 * @param {Object} [options]
 * @param {string} [options.targetDir]
 * @returns {import('../result').UnitResult<{ status: 'connected'|'not_found', targetDir: string, lastSyncedAt: string|null, workspaceCount: number, checksum: string|null }>}
 */
function getSyncStatus(options = {}) {
  try {
    const targetDir = options.targetDir || detectLocalDriveFolder();
    if (!targetDir || !fs.existsSync(targetDir)) {
      return ok({
        status: 'not_found',
        targetDir: targetDir || '',
        lastSyncedAt: null,
        workspaceCount: 0,
        checksum: null
      });
    }

    const manifestPath = path.join(targetDir, MANIFEST_FILE_NAME);
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        return ok({
          status: 'connected',
          targetDir,
          lastSyncedAt: manifest.lastSyncedAt || null,
          workspaceCount: manifest.workspaceCount || 0,
          checksum: manifest.checksum || null
        });
      } catch {}
    }

    return ok({
      status: 'connected',
      targetDir,
      lastSyncedAt: null,
      workspaceCount: 0,
      checksum: null
    });
  } catch (e) {
    return err(
      ErrorCodes.SYNC_DRIVE_FOLDER_NOT_FOUND_001,
      'Drive status probe failed: ' + (e instanceof Error ? e.message : String(e))
    );
  }
}

module.exports = {
  DRIVE_FOLDER_NAME,
  WORKSPACES_FILE_NAME,
  SETTINGS_FILE_NAME,
  MANIFEST_FILE_NAME,
  detectLocalDriveFolder,
  computeChecksum,
  exportToDrive,
  importFromDrive,
  getSyncStatus
};
