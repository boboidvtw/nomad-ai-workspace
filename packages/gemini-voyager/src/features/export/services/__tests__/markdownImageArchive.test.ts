import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MarkdownFormatter } from '../MarkdownFormatter';
import { packageMarkdownImages } from '../markdownImageArchive';

function imageMarkdown(count: number): string {
  return Array.from({ length: count }, (_, index) => `![](https://example.com/${index}.png)`).join(
    '\n',
  );
}

describe('packageMarkdownImages', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leaves images that do not fit the byte budget as remote links', async () => {
    const rewrite = vi.spyOn(MarkdownFormatter, 'rewriteImageUrls');

    const archived = await packageMarkdownImages({
      markdown: '![a](https://example.com/a.png)\n![b](https://example.com/b.png)',
      normalizedFilename: 'chat.md',
      markdownEntryName: 'chat.md',
      imageByteBudget: 8,
      download: () => {},
      toOriginalSizeUrl: (url) => url,
      pickExtension: () => 'png',
      fetchImage: async () => ({
        blob: new Blob([Uint8Array.from([1, 2, 3, 4, 5, 6])]),
        contentType: 'image/png',
      }),
    });

    expect(archived).toEqual({ filename: 'chat.zip', omittedImageCount: 1 });
    const mapping = rewrite.mock.calls[0]?.[1] as Map<string, string>;
    expect(mapping.size).toBe(1);
    expect(mapping.has('https://example.com/a.png')).toBe(true);
    expect(mapping.has('https://example.com/b.png')).toBe(false);
  });

  it('archives every image of a long conversation in order', async () => {
    let downloaded: Blob | null = null;

    const archived = await packageMarkdownImages({
      markdown: imageMarkdown(166),
      normalizedFilename: 'chat.md',
      markdownEntryName: 'chat.md',
      download: (blob) => {
        downloaded = blob;
      },
      toOriginalSizeUrl: (url) => url,
      pickExtension: () => 'png',
      // Later images answer first, so order must come from the markdown.
      fetchImage: async (url) => {
        const index = Number(/\/(\d+)\.png$/.exec(url)?.[1]);
        await new Promise((resolve) => setTimeout(resolve, (166 - index) % 4));
        return { blob: new Blob([`image-${index}`]), contentType: 'image/png' };
      },
    });

    expect(archived).toEqual({ filename: 'chat.zip', omittedImageCount: 0 });
    const zip = await JSZip.loadAsync(downloaded as unknown as Blob);
    expect(Object.keys(zip.files).filter((name) => name.startsWith('assets/'))).toHaveLength(166);
    expect(await zip.file('assets/img-166.png')?.async('string')).toBe('image-165');
    const markdown = (await zip.file('chat.md')?.async('string')) ?? '';
    expect(markdown).not.toContain('https://example.com/');
    expect(markdown).toContain('assets/img-001.png');
  });

  it('keeps the link of an image it cannot read and still downloads the rest', async () => {
    const readAsArrayBuffer = FileReader.prototype.readAsArrayBuffer;
    vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (
      this: FileReader,
      blob: Blob,
    ) {
      if (blob.size !== 3) return readAsArrayBuffer.call(this, blob);
      queueMicrotask(() => this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>));
    });
    const rewrite = vi.spyOn(MarkdownFormatter, 'rewriteImageUrls');
    const download = vi.fn();

    const archived = await packageMarkdownImages({
      markdown: imageMarkdown(3),
      normalizedFilename: 'chat.md',
      markdownEntryName: 'chat.md',
      download,
      toOriginalSizeUrl: (url) => url,
      pickExtension: () => 'png',
      fetchImage: async (url) => ({
        blob: new Blob([url.endsWith('/1.png') ? 'bad' : 'good']),
        contentType: 'image/png',
      }),
    });

    expect(archived.omittedImageCount).toBe(1);
    expect(download).toHaveBeenCalledOnce();
    const mapping = rewrite.mock.calls[0]?.[1] as Map<string, string>;
    expect([...mapping.keys()]).toEqual(['https://example.com/0.png', 'https://example.com/2.png']);
  });

  it('downloads nothing when the export is cancelled mid-archive', async () => {
    const controller = new AbortController();
    const download = vi.fn();

    await expect(
      packageMarkdownImages({
        markdown: imageMarkdown(10),
        normalizedFilename: 'chat.md',
        markdownEntryName: 'chat.md',
        signal: controller.signal,
        download,
        toOriginalSizeUrl: (url) => url,
        pickExtension: () => 'png',
        fetchImage: async (url) => {
          if (url.endsWith('/3.png')) controller.abort();
          return { blob: new Blob(['x']), contentType: 'image/png' };
        },
      }),
    ).rejects.toThrow(/cancelled/);
    expect(download).not.toHaveBeenCalled();
  });
});
