import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { readMosaicFile } from '../src/core/file.ts';
import { MOSAIC_LIMITS } from '../src/core/limits.ts';
import { parseMosaicBytes, parseMosaicText } from '../src/core/parse.ts';

const encode = (text: string) => new TextEncoder().encode(text);
const header = '{"mosaic":"0.1.0"}';

describe('Mosaic source parsing', () => {
  it('preserves the reference document through file, bytes, and text', async () => {
    const text = readFileSync(new URL('../examples/mosaic-demo.mosa', import.meta.url), 'utf8');
    const expected = { ok: true, value: JSON.parse(text) };
    expect(await readMosaicFile(new File([text], 'demo.mosa'))).toEqual(expected);
    expect(parseMosaicBytes(encode(text))).toEqual(expected);
    expect(parseMosaicText(text)).toEqual(expected);
  });

  it('keeps source parsing independent from schema and semantic validation', () => {
    expect(parseMosaicText(header)).toEqual({ ok: true, value: { mosaic: '0.1.0' } });
  });

  it('decodes only the supplied byte view', () => {
    const buf = new Uint8Array([0xff, ...encode(header), 0xff]);
    expect(parseMosaicBytes(buf.subarray(1, -1))).toEqual(parseMosaicText(header));
  });

  it.each([
    '',
    '\t\n ',
    '{"a":',
    '{"mosaic":"0.1.0",}',
    '[}',
    '{]',
    '{}{}',
    '{a:1}',
    '{"a":"unfinished',
    '{"a":"bad\nline"}',
    String.raw`{"bad\u123x":1}`,
    String.raw`{"a":"\q"}`,
    '{"a":01}',
    '{"a":true false}',
    '/* comment */{}',
  ])('returns a document-wide error for malformed JSON %j', (text) => {
    expect(parseMosaicText(text)).toMatchObject({
      ok: false,
      errors: [{ code: 'INVALID_JSON', path: '' }],
    });
  });

  it.each(['null', 'true', '1', '"text"', '[]'])('rejects non-object top levels (%s)', (text) => {
    expect(parseMosaicText(text)).toMatchObject({
      ok: false,
      errors: [{ code: 'SCHEMA_ERROR', path: '' }],
    });
  });

  it.each(['{}', '{"version":"0.1.0"}', '{"mosaic":0.1}', '{"mosaic":null}'])(
    'requires an own version string (%s)',
    (text) => {
      expect(parseMosaicText(text)).toMatchObject({
        ok: false,
        errors: [{ code: 'SCHEMA_ERROR', path: '/mosaic' }],
      });
    },
  );

  it.each(['0.1', '0.1.1', '1.0.0', '', '0.1.0 '])('reports unsupported version %j', (version) => {
    expect(parseMosaicBytes(encode(JSON.stringify({ mosaic: version })))).toMatchObject({
      ok: false,
      errors: [{ code: 'UNSUPPORTED_VERSION', path: '/mosaic' }],
    });
  });

  it.each([
    ['{"mosaic":"99","mosaic":"0.1.0"}', '/mosaic'],
    [String.raw`{"state":{"flag":true,"fl\u0061g":false}}`, '/state/flag'],
    [String.raw`{"a/b":[{},[{"~x":1,"\u007ex":2}]]}`, '/a~1b/1/0/~0x'],
    [String.raw`{"😀":1,"\ud83d\ude00":2}`, '/😀'],
    ['{"":{"":false,"":true}}', '//'],
    ['{"__proto__":0,"__proto__":1}', '/__proto__'],
    ['{"constructor":null,"constructor": {}}', '/constructor'],
    [String.raw`{"a\\b":1,"a\u005cb":2}`, '/a\\b'],
  ])('rejects duplicate keys at the decoded pointer %s', (text, path) => {
    expect(parseMosaicText(text)).toMatchObject({
      ok: false,
      errors: [{ code: 'INVALID_JSON', path }],
    });
  });

  it('scopes keys to each object, preserves distinct Unicode spellings, and skips punctuation in strings', () => {
    const value = {
      mosaic: '0.1.0',
      data: [
        { k: '\\", "k": [0, { } ]', a: [{ k: 1 }, { k: 2 }] },
        { k: '', é: 1, 'e\u0301': 2, ' /~"': '}",\\\\', '': {} },
      ],
    };
    for (const space of [undefined, 2]) {
      expect(parseMosaicText(JSON.stringify(value, null, space))).toEqual({ ok: true, value });
    }
  });

  it('checks source syntax before version dispatch', () => {
    expect(parseMosaicText('{"mosaic":"1.0.0"} trailing')).toMatchObject({
      ok: false,
      errors: [{ code: 'INVALID_JSON' }],
    });
  });

  it('preserves an escaped lone UTF-16 unit as JSON data and rejects an unencodable raw source unit', () => {
    const text = String.raw`{"mosaic":"0.1.0","a":"\uD800"}`;
    expect(parseMosaicText(text)).toEqual({ ok: true, value: { mosaic: '0.1.0', a: '\uD800' } });
    for (const unit of ['\uD800', '\uDC00']) {
      expect(parseMosaicText(text.replace('\\uD800', unit))).toMatchObject({
        ok: false,
        errors: [{ code: 'INVALID_UTF8', path: '' }],
      });
    }
  });

  it('keeps duplicate scanning iterative and bounded for excessive container nesting', () => {
    const text = '{"mosaic":"0.1.0","data":' + '['.repeat(40000) + '0' + ']'.repeat(40000) + '}';
    expect(parseMosaicText(text)).toMatchObject({
      ok: false,
      errors: [{ code: 'RESOURCE_LIMIT' }],
    });
  });

  it('allows the deepest layout tree permitted by the contract, including its final empty children array', () => {
    let node = '{"id":"last","type":"column","children":[]}';
    for (let i = 1; i < MOSAIC_LIMITS.treeDepth; i++)
      node = `{"id":"n${i}","type":"row","children":[${node}]}`;
    expect(parseMosaicText(`{"mosaic":"0.1.0","root":${node}}`).ok).toBe(true);
  });
});

describe('UTF-8, BOM and byte boundaries', () => {
  it.each([
    [0x80],
    [0xc0, 0xaf],
    [0xe2, 0x82],
    [0xed, 0xa0, 0x80],
    [0xf4, 0x90, 0x80, 0x80],
    [0xff, 0xfe],
  ])(
    'rejects invalid bytes starting with %i instead of inserting a replacement character',
    (...bytes) => {
      expect(
        parseMosaicBytes(
          new Uint8Array([...encode('{"mosaic":"0.1.0","x":"'), ...bytes, ...encode('"}')]),
        ),
      ).toMatchObject({ ok: false, errors: [{ code: 'INVALID_UTF8', path: '' }] });
    },
  );

  it('accepts one leading BOM and preserves literal U+FEFF and U+FFFD in data', async () => {
    const text = '\uFEFF\t{"mosaic":"0.1.0","a":"\uFEFF\uFFFD"}';
    const expected = { ok: true, value: { mosaic: '0.1.0', a: '\uFEFF\uFFFD' } };
    expect(parseMosaicText(text)).toEqual(expected);
    expect(await readMosaicFile(new Blob([text]))).toEqual(expected);
  });

  it.each(['\uFEFF\uFEFF', ' \uFEFF'])(
    'rejects extra or misplaced BOM %j on both paths',
    (prefix) => {
      for (const result of [
        parseMosaicText(prefix + header),
        parseMosaicBytes(encode(prefix + header)),
      ]) {
        expect(result).toMatchObject({ ok: false, errors: [{ code: 'INVALID_JSON', path: '' }] });
      }
    },
  );

  it.each(['a', 'é', '雪', '😀'])(
    'measures the complete UTF-8 source at the boundary using %j',
    async (character) => {
      const prefix = '\uFEFF{"mosaic":"0.1.0","a":"';
      const suffix = '"}\n';
      const budget = MOSAIC_LIMITS.fileBytes - encode(prefix + suffix).length;
      const width = encode(character).length;
      const text =
        prefix + character.repeat(Math.floor(budget / width)) + ' '.repeat(budget % width) + suffix;
      const bytes = encode(text);
      expect(bytes.byteLength).toBe(MOSAIC_LIMITS.fileBytes);
      expect(parseMosaicText(text).ok).toBe(true);
      expect(parseMosaicBytes(bytes).ok).toBe(true);
      const tooBig = { ok: false, errors: [{ code: 'FILE_TOO_LARGE', path: '' }] };
      expect(parseMosaicText(text + ' ')).toMatchObject(tooBig);
      expect(await readMosaicFile(new Blob([bytes, ' ']))).toMatchObject(tooBig);
    },
  );

  it('rejects an oversized Blob before invoking its read method', async () => {
    const file = new Blob([new Uint8Array(MOSAIC_LIMITS.fileBytes + 1)]);
    const read = vi.spyOn(file, 'arrayBuffer');
    expect(await readMosaicFile(file)).toMatchObject({
      ok: false,
      errors: [{ code: 'FILE_TOO_LARGE', path: '' }],
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('checks byte length before decoding invalid content', () => {
    const bytes = new Uint8Array(MOSAIC_LIMITS.fileBytes + 1);
    bytes[0] = 0xff;
    expect(parseMosaicBytes(bytes)).toMatchObject({
      ok: false,
      errors: [{ code: 'FILE_TOO_LARGE', path: '' }],
    });
  });

  it('propagates a file read failure separately from document diagnostics', async () => {
    const file = new Blob([header]);
    const error = new DOMException('File unavailable', 'NotReadableError');
    vi.spyOn(file, 'arrayBuffer').mockRejectedValueOnce(error);
    await expect(readMosaicFile(file)).rejects.toBe(error);
  });
});
