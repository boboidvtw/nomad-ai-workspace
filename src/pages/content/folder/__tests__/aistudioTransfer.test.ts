import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import {
  exportTimestamp,
  formatRelativeTime,
  getCloudTooltip,
  mergeImportedFolderData,
} from '../aistudioTransfer';
import type { FolderData } from '../types';

vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendMessage: vi.fn() } },
}));

const sendMessage = vi.mocked(browser.runtime.sendMessage);
const t = (key: string) =>
  ({
    justNow: 'just now',
    minutesAgo: 'min ago',
    hoursAgo: 'h ago',
    yesterday: 'yesterday',
    folder_cloud_upload: 'Upload',
    folder_cloud_sync: 'Sync',
    lastUploaded: 'Uploaded {time}',
    lastSynced: 'Synced {time}',
    neverUploaded: 'Never uploaded',
    neverSynced: 'Never synced',
  })[key] ?? key;

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0);

beforeEach(() => {
  sendMessage.mockReset();
});

describe('formatRelativeTime', () => {
  it('buckets the elapsed time', () => {
    expect(formatRelativeTime(null, t, NOW)).toBe('');
    expect(formatRelativeTime(NOW - 30_000, t, NOW)).toBe('just now');
    expect(formatRelativeTime(NOW - 5 * 60_000, t, NOW)).toBe('5 min ago');
    expect(formatRelativeTime(NOW - 3 * 3_600_000, t, NOW)).toBe('3 h ago');
    expect(formatRelativeTime(NOW - 30 * 3_600_000, t, NOW)).toBe('yesterday');
    const old = NOW - 5 * 86_400_000;
    expect(formatRelativeTime(old, t, NOW)).toBe(new Date(old).toLocaleDateString());
  });
});

describe('getCloudTooltip', () => {
  it('adds the last upload time', async () => {
    sendMessage.mockResolvedValue({ ok: true, state: { lastUploadTime: Date.now() } });
    await expect(getCloudTooltip('upload', t)).resolves.toBe('Upload\nUploaded just now');
    expect(sendMessage).toHaveBeenCalledWith({ type: 'gv.sync.getState' });
  });

  it('says when it never synced', async () => {
    sendMessage.mockResolvedValue({ ok: true, state: { lastSyncTime: null } });
    await expect(getCloudTooltip('sync', t)).resolves.toBe('Sync\nNever synced');
  });

  it('falls back to the plain label when the state request fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    sendMessage.mockRejectedValue(new Error('no receiver'));
    await expect(getCloudTooltip('upload', t)).resolves.toBe('Upload');
    sendMessage.mockResolvedValue({ ok: false });
    await expect(getCloudTooltip('sync', t)).resolves.toBe('Sync');
  });
});

describe('mergeImportedFolderData', () => {
  const conv = (id: string) => ({
    conversationId: id,
    title: id,
    url: `/prompts/${id}`,
    addedAt: 1,
  });
  const folder = (id: string) => ({
    id,
    name: id,
    parentId: null,
    isExpanded: true,
    createdAt: 1,
    updatedAt: 1,
  });

  it('adds new folders and unions the conversations of existing ones', () => {
    const base: FolderData = { folders: [folder('a')], folderContents: { a: [conv('1')] } };
    const incoming: FolderData = {
      folders: [folder('a'), folder('b')],
      folderContents: { a: [conv('1'), conv('2')], b: [conv('3')] },
    };

    const merged = mergeImportedFolderData(base, incoming);

    expect(merged.folders.map((f) => f.id)).toEqual(['a', 'b']);
    expect(merged.folderContents.a.map((c) => c.conversationId)).toEqual(['1', '2']);
    expect(merged.folderContents.b.map((c) => c.conversationId)).toEqual(['3']);
  });

  it('does not modify its inputs', () => {
    const base: FolderData = { folders: [folder('a')], folderContents: { a: [conv('1')] } };
    const incoming: FolderData = {
      folders: [folder('a'), folder('b')],
      folderContents: { a: [conv('2')] },
    };

    const merged = mergeImportedFolderData(base, incoming);

    expect(base.folders).toHaveLength(1);
    expect(base.folderContents.a).toHaveLength(1);
    expect(merged.folderContents.b).toEqual([]);
  });
});

describe('exportTimestamp', () => {
  it('formats a local date as YYYYMMDD-HHMMSS', () => {
    expect(exportTimestamp(new Date(2026, 0, 2, 3, 4, 5))).toBe('20260102-030405');
  });
});
