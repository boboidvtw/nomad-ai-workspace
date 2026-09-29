/**
 * STORE-method zip writer. Each entry is written as soon as its bytes are
 * known, so the caller can drop that image before fetching the next one.
 * Images are already compressed; deflate would spend CPU without shrinking them.
 */

const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;
const ZIP64_EOCD = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EXTRA = 0x0001;
const ZIP64_MARKER = 0xffffffff;
const UTF8_FLAG = 0x0800;
const ZIP64_VERSION = 45;
const ZIP32_VERSION = 20;
/** DOS date fields only span 1980-2107, and their seconds field counts by two. */
const DOS_MIN_YEAR = 1980;
const DOS_MAX_YEAR = 2107;

export interface DosStamp {
  time: number;
  date: number;
}

export function dosStamp(now: Date): DosStamp {
  const year = now.getFullYear();
  if (!Number.isFinite(year) || year < DOS_MIN_YEAR) return { time: 0, date: (1 << 5) | 1 };
  const clamped = Math.min(year, DOS_MAX_YEAR);
  return {
    time: (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1),
    date: ((clamped - DOS_MIN_YEAR) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
  };
}

export interface ZipByteSink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/**
 * Collects the archive as Blob parts. The Blob constructor copies each chunk,
 * so the caller's bytes can be dropped at once, and Chromium moves large blobs
 * to disk under memory pressure instead of keeping them in the JS heap.
 */
export class BlobZipSink implements ZipByteSink {
  private readonly parts: Blob[] = [];
  private closed = false;

  async write(chunk: Uint8Array): Promise<void> {
    if (this.closed) throw new Error('zip sink is already closed');
    this.parts.push(new Blob([chunk as Uint8Array<ArrayBuffer>]));
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  toBlob(): Blob {
    return new Blob(this.parts, { type: 'application/zip' });
  }
}

interface ZipEntry {
  name: Uint8Array;
  stamp: DosStamp;
  crc: number;
  size: number;
  offset: number;
  zip64: boolean;
}

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  CRC_TABLE[index] = crc >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

function writeUint64(view: DataView, offset: number, value: number): void {
  writeUint32(view, offset, value >>> 0);
  writeUint32(view, offset + 4, Math.floor(value / 0x100000000));
}

function zip64Extra(fields: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(4 + fields.length * 8);
  const view = new DataView(bytes.buffer);
  writeUint16(view, 0, ZIP64_EXTRA);
  writeUint16(view, 2, fields.length * 8);
  fields.forEach((field, index) => writeUint64(view, 4 + index * 8, field));
  return bytes;
}

function localHeader(
  name: Uint8Array,
  crc: number,
  size: number,
  zip64: boolean,
  stamp: DosStamp,
): Uint8Array {
  const extra = zip64 ? zip64Extra([size, size]) : new Uint8Array();
  const bytes = new Uint8Array(30 + name.length + extra.length);
  const view = new DataView(bytes.buffer);
  writeUint32(view, 0, ZIP_LOCAL);
  writeUint16(view, 4, zip64 ? ZIP64_VERSION : ZIP32_VERSION);
  writeUint16(view, 6, UTF8_FLAG);
  writeUint16(view, 8, 0);
  writeUint16(view, 10, stamp.time);
  writeUint16(view, 12, stamp.date);
  writeUint32(view, 14, crc);
  writeUint32(view, 18, zip64 ? ZIP64_MARKER : size);
  writeUint32(view, 22, zip64 ? ZIP64_MARKER : size);
  writeUint16(view, 26, name.length);
  writeUint16(view, 28, extra.length);
  bytes.set(name, 30);
  bytes.set(extra, 30 + name.length);
  return bytes;
}

function centralHeader(entry: ZipEntry): Uint8Array {
  const extra = entry.zip64 ? zip64Extra([entry.size, entry.size, entry.offset]) : new Uint8Array();
  const bytes = new Uint8Array(46 + entry.name.length + extra.length);
  const view = new DataView(bytes.buffer);
  writeUint32(view, 0, ZIP_CENTRAL);
  writeUint16(view, 4, entry.zip64 ? ZIP64_VERSION : ZIP32_VERSION);
  writeUint16(view, 6, entry.zip64 ? ZIP64_VERSION : ZIP32_VERSION);
  writeUint16(view, 8, UTF8_FLAG);
  writeUint16(view, 10, 0);
  writeUint16(view, 12, entry.stamp.time);
  writeUint16(view, 14, entry.stamp.date);
  writeUint32(view, 16, entry.crc);
  writeUint32(view, 20, entry.zip64 ? ZIP64_MARKER : entry.size);
  writeUint32(view, 24, entry.zip64 ? ZIP64_MARKER : entry.size);
  writeUint16(view, 28, entry.name.length);
  writeUint16(view, 30, extra.length);
  writeUint16(view, 32, 0);
  writeUint16(view, 34, 0);
  writeUint16(view, 36, 0);
  writeUint32(view, 38, 0);
  writeUint32(view, 42, entry.zip64 ? ZIP64_MARKER : entry.offset);
  bytes.set(entry.name, 46);
  bytes.set(extra, 46 + entry.name.length);
  return bytes;
}

function endOfCentralDirectory(options: {
  count: number;
  centralSize: number;
  centralOffset: number;
  zip64: boolean;
  zip64Offset: number;
}): Uint8Array {
  const classic = new Uint8Array(22);
  const classicView = new DataView(classic.buffer);
  const countOverflow = options.zip64 || options.count >= 0xffff;
  writeUint32(classicView, 0, ZIP_EOCD);
  writeUint16(classicView, 4, 0);
  writeUint16(classicView, 6, 0);
  writeUint16(classicView, 8, countOverflow ? 0xffff : options.count);
  writeUint16(classicView, 10, countOverflow ? 0xffff : options.count);
  writeUint32(
    classicView,
    12,
    options.zip64 || options.centralSize >= ZIP64_MARKER ? ZIP64_MARKER : options.centralSize,
  );
  writeUint32(
    classicView,
    16,
    options.zip64 || options.centralOffset >= ZIP64_MARKER ? ZIP64_MARKER : options.centralOffset,
  );
  writeUint16(classicView, 20, 0);
  if (!options.zip64) return classic;

  const record = new Uint8Array(56);
  const recordView = new DataView(record.buffer);
  writeUint32(recordView, 0, ZIP64_EOCD);
  writeUint64(recordView, 4, 44);
  writeUint16(recordView, 12, ZIP64_VERSION);
  writeUint16(recordView, 14, ZIP64_VERSION);
  writeUint32(recordView, 16, 0);
  writeUint32(recordView, 20, 0);
  writeUint64(recordView, 24, options.count);
  writeUint64(recordView, 32, options.count);
  writeUint64(recordView, 40, options.centralSize);
  writeUint64(recordView, 48, options.centralOffset);

  const locator = new Uint8Array(20);
  const locatorView = new DataView(locator.buffer);
  writeUint32(locatorView, 0, ZIP64_LOCATOR);
  writeUint32(locatorView, 4, 0);
  writeUint64(locatorView, 8, options.zip64Offset);
  writeUint32(locatorView, 16, 1);

  const tail = new Uint8Array(record.length + locator.length + classic.length);
  tail.set(record, 0);
  tail.set(locator, record.length);
  tail.set(classic, record.length + locator.length);
  return tail;
}

export class StreamingZipWriter {
  private offset = 0;
  private finished = false;
  private readonly entries: ZipEntry[] = [];

  constructor(
    private readonly sink: ZipByteSink,
    private readonly zip64Threshold = ZIP64_MARKER,
    /** One stamp for the whole archive, so every entry carries the same time. */
    private readonly stamp: DosStamp = dosStamp(new Date()),
  ) {}

  get bytesWritten(): number {
    return this.offset;
  }

  async addStored(name: string, data: Uint8Array): Promise<void> {
    if (this.finished) throw new Error('zip already finished');
    const nameBytes = new TextEncoder().encode(name);
    if (nameBytes.length === 0 || nameBytes.length > 0xffff) {
      throw new Error('zip entry name is empty or too long');
    }
    const crc = crc32(data);
    const zip64 = data.length >= this.zip64Threshold || this.offset >= this.zip64Threshold;
    const header = localHeader(nameBytes, crc, data.length, zip64, this.stamp);
    const entryOffset = this.offset;
    await this.sink.write(header);
    if (data.length > 0) await this.sink.write(data);
    this.offset += header.length + data.length;
    this.entries.push({
      name: nameBytes,
      stamp: this.stamp,
      crc,
      size: data.length,
      offset: entryOffset,
      zip64,
    });
  }

  async finish(): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    const centralOffset = this.offset;
    for (const entry of this.entries) {
      const record = centralHeader(entry);
      await this.sink.write(record);
      this.offset += record.length;
    }
    const centralSize = this.offset - centralOffset;
    const zip64 =
      this.entries.some((entry) => entry.zip64) ||
      this.entries.length >= 0xffff ||
      centralSize >= this.zip64Threshold ||
      centralOffset >= this.zip64Threshold;
    const tail = endOfCentralDirectory({
      count: this.entries.length,
      centralSize,
      centralOffset,
      zip64,
      zip64Offset: this.offset,
    });
    await this.sink.write(tail);
    this.offset += tail.length;
    await this.sink.close();
  }
}
