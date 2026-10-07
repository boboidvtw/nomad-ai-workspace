const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  exportToDrive,
  importFromDrive,
  getSyncStatus,
  detectLocalDriveFolder,
  isOk,
  isErr,
  ErrorCodes,
} = require('../../index');

test('Universal Drive Sync: detectLocalDriveFolder resolves a path string', () => {
  const folder = detectLocalDriveFolder();
  assert.strictEqual(typeof folder, 'string');
  assert.ok(folder.length > 0);
  assert.ok(folder.includes('Nomad Workspace Data'));
});

test('Universal Drive Sync: exportToDrive writes workspaces, settings and manifest with checksum', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-sync-test-'));

  const workspaces = [
    {
      id: 'ws-test-1',
      title: '1005 | 功能 | 測試工作區 1',
      turns: 2,
      updatedAt: '2026-10-05T10:00:00.000Z',
    },
    {
      id: 'ws-test-2',
      title: '1005 | 修復 | 測試工作區 2',
      turns: 5,
      updatedAt: '2026-10-05T10:05:00.000Z',
    },
  ];

  const settings = {
    layout: 'hexa',
    appearance: { theme: 'cyberpunk', accentColor: '#a855f7' },
  };

  const res = exportToDrive({ workspaces, settings, targetDir: tempDir });

  assert.strictEqual(isOk(res), true);
  assert.strictEqual(res.data.syncedCount, 2);
  assert.ok(res.data.checksum);

  // Check files on disk
  assert.strictEqual(fs.existsSync(path.join(tempDir, 'nomad-workspaces.json')), true);
  assert.strictEqual(fs.existsSync(path.join(tempDir, 'nomad-settings.json')), true);
  assert.strictEqual(fs.existsSync(path.join(tempDir, 'nomad-sync-manifest.json')), true);

  // Validate status probe
  const statusRes = getSyncStatus({ targetDir: tempDir });
  assert.strictEqual(isOk(statusRes), true);
  assert.strictEqual(statusRes.data.status, 'connected');
  assert.strictEqual(statusRes.data.workspaceCount, 2);
  assert.strictEqual(statusRes.data.checksum, res.data.checksum);

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Universal Drive Sync: importFromDrive merges workspaces based on updatedAt', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nomad-sync-import-test-'));

  const cloudWorkspaces = [
    {
      id: 'ws-common',
      title: '1005 | 設計 | 雲端較新版本',
      updatedAt: '2026-10-05T12:00:00.000Z',
    },
    {
      id: 'ws-cloud-only',
      title: '1005 | 探索 | 僅在雲端存在',
      updatedAt: '2026-10-05T11:00:00.000Z',
    },
  ];

  exportToDrive({ workspaces: cloudWorkspaces, targetDir: tempDir });

  const localWorkspaces = [
    {
      id: 'ws-common',
      title: '1005 | 設計 | 本機舊版本',
      updatedAt: '2026-10-05T09:00:00.000Z',
    },
    {
      id: 'ws-local-only',
      title: '1005 | 文件 | 僅在本機存在',
      updatedAt: '2026-10-05T08:00:00.000Z',
    },
  ];

  const importRes = importFromDrive({
    sourceDir: tempDir,
    currentWorkspaces: localWorkspaces,
    strategy: 'merge',
  });

  assert.strictEqual(isOk(importRes), true);
  const reconciled = importRes.data.reconciledWorkspaces;
  assert.strictEqual(reconciled.length, 3); // ws-common, ws-local-only, ws-cloud-only

  // Verify ws-common was updated to cloud newer version
  const common = reconciled.find((w) => w.id === 'ws-common');
  assert.strictEqual(common.title, '1005 | 設計 | 雲端較新版本');

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('Universal Drive Sync: error handling on missing folder or invalid payload', () => {
  const badExport = exportToDrive({ workspaces: 'not-an-array' });
  assert.strictEqual(isErr(badExport), true);
  assert.strictEqual(badExport.errorCode, ErrorCodes.SYNC_INVALID_PAYLOAD_006);

  const missingImport = importFromDrive({ sourceDir: '/non/existent/path/999' });
  assert.strictEqual(isErr(missingImport), true);
  assert.strictEqual(missingImport.errorCode, ErrorCodes.SYNC_DRIVE_FOLDER_NOT_FOUND_001);
});
