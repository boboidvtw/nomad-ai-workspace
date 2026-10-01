import { describe, expect, it } from "vitest";
import type { Folder } from "@/types/folder";

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
        new Set([...(existing.conversationIds || []), ...(cloudF.conversationIds || [])])
      );
      const idx = mergedFolders.findIndex((f) => f.id === cloudF.id);
      if (idx !== -1) {
        mergedFolders[idx] = {
          ...existing,
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

describe("Bidirectional Sync & Data Unpacking", () => {
  describe("ChatGPT Bidirectional Merge", () => {
    it("merges remote cloud folders with local folders and unions conversation IDs without duplicates", () => {
      const local: Folder[] = [
        { id: "f1", name: "AI Dev", conversationIds: ["c1", "c2"], isExpanded: true },
        { id: "f2", name: "Local Only", conversationIds: ["c3"], isExpanded: false },
      ];

      const cloud: Folder[] = [
        { id: "f1", name: "AI Dev", conversationIds: ["c2", "c4"], isExpanded: true },
        { id: "f3", name: "Cloud Only", conversationIds: ["c5"], isExpanded: true },
      ];

      const merged = mergeChatGPTRemoteFolders(local, cloud);

      expect(merged).toHaveLength(3);
      const f1 = merged.find((f) => f.id === "f1");
      expect(f1?.conversationIds).toEqual(["c1", "c2", "c4"]);

      const f2 = merged.find((f) => f.id === "f2");
      expect(f2?.conversationIds).toEqual(["c3"]);

      const f3 = merged.find((f) => f.id === "f3");
      expect(f3?.conversationIds).toEqual(["c5"]);
    });

    it("handles empty local or empty cloud folders gracefully", () => {
      const local: Folder[] = [{ id: "f1", name: "Local", conversationIds: ["c1"], isExpanded: true }];
      expect(mergeChatGPTRemoteFolders(local, [])).toEqual(local);
      expect(mergeChatGPTRemoteFolders([], local)).toEqual(local);
    });
  });

  describe("Claude Cloud Download Unpacking", () => {
    it("correctly unpacks raw array payload returned by GoogleDriveSyncService", () => {
      const rawArrayFromDrive: Folder[] = [
        { id: "claude-f1", name: "Claude Coding", conversationIds: ["chat-123"], isExpanded: true },
      ];

      const unpacked = unpackClaudeCloudFolders(rawArrayFromDrive);
      expect(unpacked).toEqual(rawArrayFromDrive);
      expect(unpacked[0].name).toBe("Claude Coding");
    });

    it("correctly unpacks legacy nested object payload", () => {
      const legacyNested = {
        folders: {
          data: [{ id: "claude-f2", name: "Claude Research", conversationIds: ["chat-456"] }],
        },
      };

      const unpacked = unpackClaudeCloudFolders(legacyNested);
      expect(unpacked).toHaveLength(1);
      expect(unpacked[0].id).toBe("claude-f2");
    });

    it("returns empty array when responseData is empty or null", () => {
      expect(unpackClaudeCloudFolders(null)).toEqual([]);
      expect(unpackClaudeCloudFolders(undefined)).toEqual([]);
      expect(unpackClaudeCloudFolders({})).toEqual([]);
    });
  });
});
