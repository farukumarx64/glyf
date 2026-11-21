import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { checksums, fileRecords, releaseArchive } from '../scripts/release/archive.ts';

describe('candidate archive', () => {
  it('is byte-identical across input order and retains empty, Unicode and block-boundary contents', () => {
    const files = [
      { name: 'candidate/empty', bytes: Buffer.alloc(0) },
      { name: 'candidate/unicode.txt', bytes: Buffer.from('雪 😀\n') },
      { name: 'candidate/block.bin', bytes: Buffer.alloc(513, 0xab) },
    ];
    const before = structuredClone(files);
    const archive = releaseArchive(files);
    expect(releaseArchive([...files].reverse())).toEqual(archive);
    expect(files.map((file) => [...file.bytes])).toEqual(before.map((file) => [...file.bytes]));
    expect(archive.subarray(4, 8)).toEqual(Buffer.alloc(4));
    expect(archive[9]).toBe(255);
    const tar = gunzipSync(archive);
    let offset = 0;
    for (const expected of [...files].sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const header = tar.subarray(offset, offset + 512);
      expect(header.toString('ascii', 0, 100).replace(/\0.*$/s, '')).toBe(expected.name);
      expect(header.toString('ascii', 257, 265)).toBe('ustar\0' + '00');
      expect(header.toString('ascii', 100, 108)).toBe('0000644\0');
      expect(header[156]).toBe(0x30);
      const size = parseInt(header.toString('ascii', 124, 136), 8);
      expect(size).toBe(expected.bytes.length);
      const checksum = parseInt(header.toString('ascii', 148, 156), 8);
      const copy = Buffer.from(header);
      copy.fill(0x20, 148, 156);
      expect(copy.reduce((sum, byte) => sum + byte, 0)).toBe(checksum);
      expect(tar.subarray(offset + 512, offset + 512 + size)).toEqual(expected.bytes);
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    expect(tar.subarray(offset)).toEqual(Buffer.alloc(1024));
  });

  it.each([
    '/absolute',
    '../escape',
    'a/../escape',
    'a//b',
    'a/./b',
    'a\\b',
    'a\nb',
    'x'.repeat(101),
  ])('rejects unsafe or unsupported archive path %j', (name) => {
    expect(() => releaseArchive([{ name, bytes: Buffer.alloc(0) }])).toThrow(/release path/);
  });

  it('rejects duplicate entries and leaves no ambiguous checksum names', () => {
    const file = { name: 'a', bytes: Buffer.alloc(0) };
    expect(() => releaseArchive([file, file])).toThrow(/duplicate/);
    expect(() => checksums([file, file])).toThrow(/duplicate/);
  });

  it('writes sorted, byte-counted SHA-256 records using a known hash', () => {
    const file = { name: 'empty', bytes: Buffer.alloc(0) };
    const hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(fileRecords([file])).toEqual([{ path: 'empty', bytes: 0, sha256: hash }]);
    expect(checksums([file])).toBe(`${hash}  empty\n`);
  });
});
