import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  BlobZipSink,
  crc32,
  dosStamp,
  StreamingZipWriter,
  type ZipByteSink,
} from '../streamingZip';

class CollectingSink implements ZipByteSink {
  readonly chunks: Uint8Array[] = [];
  closed = false;

  async write(chunk: Uint8Array): Promise<void> {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    this.chunks.push(copy);
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

describe('streaming zip writer', () => {
  it('computes the standard CRC-32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes stored entries a reader can unpack', async () => {
    const sink = new BlobZipSink();
    const writer = new StreamingZipWriter(sink);
    const image = Uint8Array.from([1, 2, 3, 4]);
    await writer.addStored('chat.md', new TextEncoder().encode('# Hello'));
    await writer.addStored('assets/img-001.png', image);
    // The sink copied the bytes, so the caller may reuse its buffer at once.
    image.fill(0);
    await writer.finish();

    await expect(sink.write(Uint8Array.from([1]))).rejects.toThrow(/closed/);
    const zip = await JSZip.loadAsync(sink.toBlob());
    expect(await zip.file('chat.md')?.async('string')).toBe('# Hello');
    expect(Array.from((await zip.file('assets/img-001.png')?.async('uint8array')) ?? [])).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('encodes a wall-clock time into the DOS date and time fields', () => {
    // DOS packs the local time with a two-second resolution, and counts years
    // from 1980. 2031-05-17 13:45:31 must round down to :30.
    expect(dosStamp(new Date(2031, 4, 17, 13, 45, 31))).toEqual({
      time: (13 << 11) | (45 << 5) | 15,
      date: ((2031 - 1980) << 9) | (5 << 5) | 17,
    });
  });

  it('stamps every entry with the time the archive was written', async () => {
    const sink = new CollectingSink();
    const stamp = dosStamp(new Date(2031, 4, 17, 13, 45, 31));
    const writer = new StreamingZipWriter(sink, undefined, stamp);
    await writer.addStored('chat.md', new TextEncoder().encode('# Hello'));
    await writer.finish();

    const local = new DataView(sink.chunks[0].buffer);
    expect(local.getUint16(10, true)).toBe(stamp.time);
    expect(local.getUint16(12, true)).toBe(stamp.date);
    const central = new DataView(sink.chunks[sink.chunks.length - 2].buffer);
    expect(central.getUint16(12, true)).toBe(stamp.time);
    expect(central.getUint16(14, true)).toBe(stamp.date);
  });

  it('writes a zip64 archive when offsets pass the threshold', async () => {
    const sink = new BlobZipSink();
    const writer = new StreamingZipWriter(sink, 0);
    await writer.addStored('a.txt', Uint8Array.from([9]));
    await writer.addStored('b.txt', Uint8Array.from([8, 7]));
    await writer.finish();

    const zip = await JSZip.loadAsync(sink.toBlob());
    expect(await zip.file('a.txt')?.async('uint8array')).toEqual(Uint8Array.from([9]));
    expect(await zip.file('b.txt')?.async('uint8array')).toEqual(Uint8Array.from([8, 7]));
  });
});
