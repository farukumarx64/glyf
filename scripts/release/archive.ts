import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

export interface ReleaseFile {
  name: string;
  bytes: Buffer;
}

export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sortedFiles(files: readonly ReleaseFile[]): ReleaseFile[] {
  const seen = new Set<string>();
  for (const { name } of files) {
    if (
      !/^[a-zA-Z0-9_./-]+$/.test(name) ||
      name.split('/').some((part) => !part || part === '.' || part === '..') ||
      Buffer.byteLength(name) > 100 ||
      seen.has(name)
    ) {
      throw new Error(`Unsafe, duplicate or overlong release path: ${name}`);
    }
    seen.add(name);
  }
  return [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export function checksums(files: readonly ReleaseFile[]): string {
  return sortedFiles(files)
    .map(({ name, bytes }) => `${sha256(bytes)}  ${name}\n`)
    .join('');
}

export function fileRecords(files: readonly ReleaseFile[]) {
  return sortedFiles(files).map(({ name, bytes }) => ({
    path: name,
    bytes: bytes.length,
    sha256: sha256(bytes),
  }));
}

/** Minimal ustar writer for this small, regular-file-only static distribution. */
export function releaseArchive(files: readonly ReleaseFile[]): Buffer {
  const blocks: Buffer[] = [];
  for (const { name, bytes } of sortedFiles(files)) {
    const header = Buffer.alloc(512);
    const octal = (offset: number, width: number, value: number) => {
      const digits = value.toString(8);
      if (digits.length >= width) throw new Error(`Release file is too large: ${name}`);
      header.write(digits.padStart(width - 1, '0') + '\0', offset, width, 'ascii');
    };
    header.write(name, 0, 100, 'ascii');
    octal(100, 8, 0o644);
    octal(108, 8, 0); // uid
    octal(116, 8, 0); // gid
    octal(124, 12, bytes.length);
    octal(136, 12, 0); // fixed epoch, independent of checkout/file mtimes
    header.fill(0x20, 148, 156); // checksum field is spaces during calculation
    header.write('0', 156, 1, 'ascii'); // regular file; no links or directory metadata
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    blocks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  const compressed = gzipSync(Buffer.concat(blocks), { level: 9 });
  // Node emits no gzip timestamp/name. Normalize the optional OS identifier too.
  compressed[9] = 255;
  return compressed;
}
