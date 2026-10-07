import { describe, expect, it } from 'vitest';

import { SUPPORTED_PLATFORMS } from '@/core/platform/registry';
import type { Folder } from '@/types/folder';

// Test the bidirectional sync merge logic used in ChatGPT FolderManager
function mergeChatGPTRemoteFolders(localFolders: Folder[], cloudFolders: Folder[]): Folder[] {
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

// Test Claude cloud download unpacking logic
function unpackClaudeCloudFolders(responseData: unknown): Folder[] {
  return (
    Array.isArray(responseData)
      ? responseData
      : ((responseData as { folders?: { data?: Folder[] } | Folder[] })?.folders as any)?.data ||
        (responseData as { folders?: Folder[] })?.folders ||
        []
  ) as Folder[];
}

// Test Claude local + remote folder and prompt merging
function mergeClaudeFoldersLocal(local: Folder[], imported: Folder[]): Folder[] {
  const localMap = new Map<string, Folder>(local.map((f) => [f.id, f]));
  const result: Folder[] = [...local];

  imported.forEach((importedFolder) => {
    const existing = localMap.get(importedFolder.id);
    if (!existing) {
      result.push(importedFolder);
    } else {
      const mergedConvIds = Array.from(
        new Set([...existing.conversationIds, ...importedFolder.conversationIds]),
      );
      const idx = result.findIndex((f) => f.id === importedFolder.id);
      if (idx !== -1) {
        result[idx] = {
          ...existing,
          conversationIds: mergedConvIds,
        };
      }
    }
  });

  return result;
}

function mergeClaudePrompts(
  localPrompts: Array<{ id: string; text: string }>,
  cloudPrompts: Array<{ id: string; text: string }>,
): Array<{ id: string; text: string }> {
  const localPromptMap = new Map(localPrompts.map((p) => [p.id, p]));
  const mergedPrompts = [...localPrompts];
  cloudPrompts.forEach((cp) => {
    if (cp?.id && !localPromptMap.has(cp.id)) {
      mergedPrompts.push(cp);
    }
  });
  return mergedPrompts;
}

// Test Gemini cloud download unpacking logic
function unpackGeminiCloudFolders(responseData: unknown): Folder[] {
  if (!responseData) return [];
  if (Array.isArray(responseData)) return responseData as Folder[];
  const obj = responseData as Record<string, unknown>;
  if (Array.isArray(obj.data)) return obj.data as Folder[];
  if (Array.isArray(obj.folders)) return obj.folders as Folder[];
  return [];
}

describe('Bidirectional Sync & Data Unpacking', () => {
  describe('ChatGPT Bidirectional Merge', () => {
    it('merges remote cloud folders with local folders and unions conversation IDs without duplicates', () => {
      const local: Folder[] = [
        { id: 'f1', name: 'AI Dev', conversationIds: ['c1', 'c2'], isExpanded: true },
        { id: 'f2', name: 'Local Only', conversationIds: ['c3'], isExpanded: false },
      ];

      const cloud: Folder[] = [
        { id: 'f1', name: 'AI Dev', conversationIds: ['c2', 'c4'], isExpanded: true },
        { id: 'f3', name: 'Cloud Only', conversationIds: ['c5'], isExpanded: true },
      ];

      const merged = mergeChatGPTRemoteFolders(local, cloud);

      expect(merged).toHaveLength(3);
      const f1 = merged.find((f) => f.id === 'f1');
      expect(f1?.conversationIds).toEqual(['c1', 'c2', 'c4']);

      const f2 = merged.find((f) => f.id === 'f2');
      expect(f2?.conversationIds).toEqual(['c3']);

      const f3 = merged.find((f) => f.id === 'f3');
      expect(f3?.conversationIds).toEqual(['c5']);
    });

    it('handles empty local or empty cloud folders gracefully', () => {
      const local: Folder[] = [
        { id: 'f1', name: 'Local', conversationIds: ['c1'], isExpanded: true },
      ];
      expect(mergeChatGPTRemoteFolders(local, [])).toEqual(local);
      expect(mergeChatGPTRemoteFolders([], local)).toEqual(local);
    });

    it('preserves folder expansion state and unions conversation IDs', () => {
      const local: Folder[] = [
        { id: 'f1', name: 'Coding', conversationIds: ['conv-1'], isExpanded: true },
      ];
      const cloud: Folder[] = [
        { id: 'f1', name: 'Coding', conversationIds: ['conv-2'], isExpanded: false },
      ];

      const merged = mergeChatGPTRemoteFolders(local, cloud);
      expect(merged[0].conversationIds).toEqual(['conv-1', 'conv-2']);
      expect(merged[0].name).toBe('Coding');
    });
  });

  describe('Claude Cloud Download & Bidirectional Merge', () => {
    it('correctly unpacks raw array payload returned by GoogleDriveSyncService', () => {
      const rawArrayFromDrive: Folder[] = [
        { id: 'claude-f1', name: 'Claude Coding', conversationIds: ['chat-123'], isExpanded: true },
      ];

      const unpacked = unpackClaudeCloudFolders(rawArrayFromDrive);
      expect(unpacked).toEqual(rawArrayFromDrive);
      expect(unpacked[0].name).toBe('Claude Coding');
    });

    it('correctly unpacks legacy nested object payload', () => {
      const legacyNested = {
        folders: {
          data: [{ id: 'claude-f2', name: 'Claude Research', conversationIds: ['chat-456'] }],
        },
      };

      const unpacked = unpackClaudeCloudFolders(legacyNested);
      expect(unpacked).toHaveLength(1);
      expect(unpacked[0].id).toBe('claude-f2');
    });

    it('returns empty array when responseData is empty or null', () => {
      expect(unpackClaudeCloudFolders(null)).toEqual([]);
      expect(unpackClaudeCloudFolders(undefined)).toEqual([]);
      expect(unpackClaudeCloudFolders({})).toEqual([]);
    });

    it('merges local and imported Claude folders without duplicate conversation IDs', () => {
      const local: Folder[] = [
        { id: 'cf1', name: 'Claude Prompts', conversationIds: ['cp1', 'cp2'], isExpanded: true },
      ];
      const remote: Folder[] = [
        { id: 'cf1', name: 'Claude Prompts', conversationIds: ['cp2', 'cp3'], isExpanded: true },
        { id: 'cf2', name: 'Claude Projects', conversationIds: ['cp4'], isExpanded: false },
      ];

      const merged = mergeClaudeFoldersLocal(local, remote);
      expect(merged).toHaveLength(2);
      expect(merged.find((f) => f.id === 'cf1')?.conversationIds).toEqual(['cp1', 'cp2', 'cp3']);
      expect(merged.find((f) => f.id === 'cf2')?.conversationIds).toEqual(['cp4']);
    });

    it('merges Claude prompts preserving local prompts and appending new cloud prompts', () => {
      const localPrompts = [{ id: 'p1', text: 'Explain React hook' }];
      const cloudPrompts = [
        { id: 'p1', text: 'Explain React hook (old)' },
        { id: 'p2', text: 'Draft architecture plan' },
      ];

      const merged = mergeClaudePrompts(localPrompts, cloudPrompts);
      expect(merged).toHaveLength(2);
      expect(merged[0]).toEqual({ id: 'p1', text: 'Explain React hook' });
      expect(merged[1]).toEqual({ id: 'p2', text: 'Draft architecture plan' });
    });
  });

  describe('Gemini Cloud Download & Bidirectional Merge', () => {
    it('unpacks nomad.gemini.folders.v1 payload correctly', () => {
      const geminiPayload = {
        format: 'nomad.gemini.folders.v1',
        exportedAt: new Date().toISOString(),
        version: '1.1.0',
        data: [
          { id: 'gf1', name: 'Gemini Research', conversationIds: ['gemini-c1'], isExpanded: true },
        ],
      };

      const unpacked = unpackGeminiCloudFolders(geminiPayload);
      expect(unpacked).toHaveLength(1);
      expect(unpacked[0].id).toBe('gf1');
      expect(unpacked[0].name).toBe('Gemini Research');
    });

    it('unpacks legacy gemini-voyager-folders.json fallback payload', () => {
      const legacyPayload = {
        folders: [{ id: 'gf-legacy', name: 'Legacy Gemini', conversationIds: ['c-leg'] }],
      };

      const unpacked = unpackGeminiCloudFolders(legacyPayload);
      expect(unpacked).toHaveLength(1);
      expect(unpacked[0].id).toBe('gf-legacy');
    });
  });

  describe('Multi-AI Platform Scheme A Google Drive Invariants', () => {
    it('guarantees all active platforms have designated Drive subfolders', () => {
      expect(SUPPORTED_PLATFORMS.gemini.driveFolder).toBe('Gemini');
      expect(SUPPORTED_PLATFORMS.claude.driveFolder).toBe('Claude');
      expect(SUPPORTED_PLATFORMS.chatgpt.driveFolder).toBe('ChatGPT');
    });
  });
});
