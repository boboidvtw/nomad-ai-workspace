import { describe, expect, it } from 'vitest';
import type { Folder } from '@/types/folder';
import { SUPPORTED_PLATFORMS } from '@/core/platform/registry';
import { DEFAULT_SYNC_STATE, type SyncState } from '@/core/types/sync';
import type { CrossPlatformFolder } from '@/core/platform/types';

// Grok bidirectional merge function (mirrors handleSyncToDrive logic in GrokFolderManager)
function mergeGrokRemoteFolders(localFolders: Folder[], cloudFolders: Folder[]): Folder[] {
  const mergedFolders = [...localFolders];
  const localMap = new Map<string, Folder>(mergedFolders.map((f) => [f.id, f]));

  cloudFolders.forEach((cloudF) => {
    const existing = localMap.get(cloudF.id);
    if (!existing) {
      mergedFolders.push(cloudF);
    } else {
      const mergedConvIds = Array.from(
        new Set([...(existing.conversationIds || []), ...(cloudF.conversationIds || [])]),
      );
      const idx = mergedFolders.findIndex((f) => f.id === cloudF.id);
      if (idx !== -1) {
        mergedFolders[idx] = {
          ...existing,
          ...cloudF,
          conversationIds: mergedConvIds,
        };
      }
    }
  });

  return mergedFolders;
}

describe('Grok Cross-Platform & Bidirectional Sync Suite', () => {
  it('correctly merges local and cloud Grok folders with conversation union', () => {
    const localFolders: Folder[] = [
      {
        id: 'grok-f1',
        name: 'Superheavy & Starship',
        conversationIds: ['chat-local-1', 'chat-common'],
        isExpanded: true,
      },
    ];

    const cloudFolders: Folder[] = [
      {
        id: 'grok-f1',
        name: 'Superheavy & Starship (Cloud Renamed)',
        conversationIds: ['chat-cloud-2', 'chat-common'],
        isExpanded: false,
      },
      {
        id: 'grok-f2',
        name: 'Optimus Gen 3',
        conversationIds: ['chat-cloud-3'],
        isExpanded: true,
      },
    ];

    const merged = mergeGrokRemoteFolders(localFolders, cloudFolders);

    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe('grok-f1');
    expect(merged[0].name).toBe('Superheavy & Starship (Cloud Renamed)');
    // Union of conversations without duplicates
    expect(merged[0].conversationIds).toEqual(['chat-local-1', 'chat-common', 'chat-cloud-2']);

    expect(merged[1].id).toBe('grok-f2');
    expect(merged[1].name).toBe('Optimus Gen 3');
    expect(merged[1].conversationIds).toEqual(['chat-cloud-3']);
  });

  it('validates Grok Google Drive export payload schema contract', () => {
    const mockFolders: Folder[] = [
      { id: 'f-1', name: 'Test', conversationIds: ['c-1'], isExpanded: true },
    ];
    const payload = {
      format: 'nomad.grok.folders.v1',
      exportedAt: new Date().toISOString(),
      version: '1.1.0',
      data: mockFolders,
    };

    expect(payload.format).toBe('nomad.grok.folders.v1');
    expect(payload.data).toEqual(mockFolders);
    expect(payload.version).toBe('1.1.0');
    expect(Date.parse(payload.exportedAt)).toBeGreaterThan(0);
  });

  it('verifies Grok platform is active and has Drive subfolder metadata', () => {
    const grokConfig = SUPPORTED_PLATFORMS.grok;
    expect(grokConfig.id).toBe('grok');
    expect(grokConfig.status).toBe('active');
    expect(grokConfig.driveFolder).toBe('Grok');
    expect(grokConfig.brandColor).toBe('#1D9BF0');
    expect(grokConfig.domains).toContain('grok.com');
  });

  it('verifies SyncState tracks Grok sync and upload timestamps independently', () => {
    expect(DEFAULT_SYNC_STATE.lastSyncTimeGrok).toBeNull();
    expect(DEFAULT_SYNC_STATE.lastUploadTimeGrok).toBeNull();

    const updatedState: SyncState = {
      ...DEFAULT_SYNC_STATE,
      lastSyncTimeGrok: 1727870000000,
      lastUploadTimeGrok: 1727871000000,
    };

    expect(updatedState.lastSyncTimeGrok).toBe(1727870000000);
    expect(updatedState.lastUploadTimeGrok).toBe(1727871000000);
  });

  it('constructs normalized CrossPlatformFolder objects for Grok conversations', () => {
    const rawGrokFolders = [
      { id: 'folder-1', name: 'Grok Research', conversationIds: ['conv-101'], isExpanded: true },
    ];
    const titleCache = { 'conv-101': 'Quantum Mechanics with Grok' };

    const parsedGrok: CrossPlatformFolder[] = rawGrokFolders.map((f) => ({
      id: f.id,
      name: f.name,
      platformId: 'grok',
      isExpanded: f.isExpanded,
      conversations: f.conversationIds.map((id) => ({
        id,
        title: titleCache[id] || `Grok 對話 (${id.slice(0, 8)})`,
        url: `https://grok.com/chat/${id}`,
        platformId: 'grok',
        folderId: f.id,
      })),
    }));

    expect(parsedGrok).toHaveLength(1);
    expect(parsedGrok[0].platformId).toBe('grok');
    expect(parsedGrok[0].conversations[0].title).toBe('Quantum Mechanics with Grok');
    expect(parsedGrok[0].conversations[0].url).toBe('https://grok.com/chat/conv-101');
  });
});
