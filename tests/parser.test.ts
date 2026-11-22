import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { readGlyfFile } from '../src/core/file.ts';
import { GLYF_LIMITS } from '../src/core/limits.ts';
import { parseGlyfBytes, parseGlyfText } from '../src/core/parse.ts';

const encode = (text: string) => new TextEncoder().encode(text);
const header = '{"glyf":"0.1.0"}';

describe('Glyf source parsing', () => {
  it('preserves the reference document through file, bytes, and text', async () => {
    const text = readFileSync(new URL('../examples/glyf-demo.glyf', import.meta.url), 'utf8');
    const expected = { ok: true, value: JSON.parse(text) };
    expect(await readGlyfFile(new File([text], 'demo.glyf'))).toEqual(expected);
    expect(parseGlyfBytes(encode(text))).toEqual(expected);
    expect(parseGlyfText(text)).toEqual(expected);
  });

  it('keeps source parsing independent from schema and semantic validation', () => {
    expect(parseGlyfText(header)).toEqual({ ok: true, value: { glyf: '0.1.0' } });
  });

  it('decodes only the supplied byte view', () => {
    const buf = new Uint8Array([0xff, ...encode(header), 0xff]);
    expect(parseGlyfBytes(buf.subarray(1, -1))).toEqual(parseGlyfText(header));
  });

  it.each([
    '',
    '\t\n ',
    '{"a":',
    '{"glyf":"0.1.0",}',
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
    expect(parseGlyfText(text)).toMatchObject({
      ok: false,
      errors: [{ code: 'INVALID_JSON', path: '' }],
    });
  });

  it.each(['null', 'true', '1', '"text"', '[]'])('rejects non-object top levels (%s)', (text) => {
    expect(parseGlyfText(text)).toMatchObject({
      ok: false,
      errors: [{ code: 'SCHEMA_ERROR', path: '' }],
    });
  });

  it.each(['{}', '{"version":"0.1.0"}', '{"glyf":0.1}', '{"glyf":null}'])(
    'requires an own version string (%s)',
    (text) => {
      expect(parseGlyfText(text)).toMatchObject({
        ok: false,
        errors: [{ code: 'SCHEMA_ERROR', path: '/glyf' }],
      });
    },
  );

  it.each(['0.1', '0.1.1', '1.0.0', '', '0.1.0 '])('reports unsupported version %j', (version) => {
    expect(parseGlyfBytes(encode(JSON.stringify({ glyf: version })))).toMatchObject({
      ok: false,
      errors: [{ code: 'UNSUPPORTED_VERSION', path: '/glyf' }],
    });
  });

  it.each([
    ['{"glyf":"99","glyf":"0.1.0"}', '/glyf'],
    [String.raw`{"state":{"flag":true,"fl\u0061g":false}}`, '/state/flag'],
    [String.raw`{"a/b":[{},[{"~x":1,"\u007ex":2}]]}`, '/a~1b/1/0/~0x'],
    [String.raw`{"😀":1,"\ud83d\ude00":2}`, '/😀'],
    ['{"":{"":false,"":true}}', '//'],
    ['{"__proto__":0,"__proto__":1}', '/__proto__'],
    ['{"constructor":null,"constructor": {}}', '/constructor'],
    [String.raw`{"a\\b":1,"a\u005cb":2}`, '/a\\b'],
  ])('rejects duplicate keys at the decoded pointer %s', (text, path) => {
    expect(parseGlyfText(text)).toMatchObject({
      ok: false,
      errors: [{ code: 'INVALID_JSON', path }],
    });
  });

  it('scopes keys to each object, preserves distinct Unicode spellings, and skips punctuation in strings', () => {
    const value = {
      glyf: '0.1.0',
      data: [
        { k: '\\", "k": [0, { } ]', a: [{ k: 1 }, { k: 2 }] },
        { k: '', é: 1, 'e\u0301': 2, ' /~"': '}",\\\\', '': {} },
      ],
    };
    for (const space of [undefined, 2]) {
      expect(parseGlyfText(JSON.stringify(value, null, space))).toEqual({ ok: true, value });
    }
  });

  it('checks source syntax before version dispatch', () => {
    expect(parseGlyfText('{"glyf":"1.0.0"} trailing')).toMatchObject({
      ok: false,
      errors: [{ code: 'INVALID_JSON' }],
    });
  });

  it('preserves an escaped lone UTF-16 unit as JSON data and rejects an unencodable raw source unit', () => {
    const text = String.raw`{"glyf":"0.1.0","a":"\uD800"}`;
    expect(parseGlyfText(text)).toEqual({ ok: true, value: { glyf: '0.1.0', a: '\uD800' } });
    for (const unit of ['\uD800', '\uDC00']) {
      expect(parseGlyfText(text.replace('\\uD800', unit))).toMatchObject({
        ok: false,
        errors: [{ code: 'INVALID_UTF8', path: '' }],
      });
    }
  });

  it('keeps duplicate scanning iterative and bounded for excessive container nesting', () => {
    const text = '{"glyf":"0.1.0","data":' + '['.repeat(40000) + '0' + ']'.repeat(40000) + '}';
    expect(parseGlyfText(text)).toMatchObject({
      ok: false,
      errors: [{ code: 'RESOURCE_LIMIT' }],
    });
  });

  it('allows the deepest layout tree permitted by the contract, including its final empty children array', () => {
    let node = '{"id":"last","type":"column","children":[]}';
    for (let i = 1; i < GLYF_LIMITS.treeDepth; i++)
      node = `{"id":"n${i}","type":"row","children":[${node}]}`;
    expect(parseGlyfText(`{"glyf":"0.1.0","root":${node}}`).ok).toBe(true);
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
        parseGlyfBytes(
          new Uint8Array([...encode('{"glyf":"0.1.0","x":"'), ...bytes, ...encode('"}')]),
        ),
      ).toMatchObject({ ok: false, errors: [{ code: 'INVALID_UTF8', path: '' }] });
    },
  );

  it('accepts one leading BOM and preserves literal U+FEFF and U+FFFD in data', async () => {
    const text = '\uFEFF\t{"glyf":"0.1.0","a":"\uFEFF\uFFFD"}';
    const expected = { ok: true, value: { glyf: '0.1.0', a: '\uFEFF\uFFFD' } };
    expect(parseGlyfText(text)).toEqual(expected);
    expect(await readGlyfFile(new Blob([text]))).toEqual(expected);
  });

  it.each(['\uFEFF\uFEFF', ' \uFEFF'])(
    'rejects extra or misplaced BOM %j on both paths',
    (prefix) => {
      for (const result of [
        parseGlyfText(prefix + header),
        parseGlyfBytes(encode(prefix + header)),
      ]) {
        expect(result).toMatchObject({ ok: false, errors: [{ code: 'INVALID_JSON', path: '' }] });
      }
    },
  );

  it.each(['a', 'é', '雪', '😀'])(
    'measures the complete UTF-8 source at the boundary using %j',
    async (character) => {
      const prefix = '\uFEFF{"glyf":"0.1.0","a":"';
      const suffix = '"}\n';
      const budget = GLYF_LIMITS.fileBytes - encode(prefix + suffix).length;
      const width = encode(character).length;
      const text =
        prefix + character.repeat(Math.floor(budget / width)) + ' '.repeat(budget % width) + suffix;
      const bytes = encode(text);
      expect(bytes.byteLength).toBe(GLYF_LIMITS.fileBytes);
      expect(parseGlyfText(text).ok).toBe(true);
      expect(parseGlyfBytes(bytes).ok).toBe(true);
      const tooBig = { ok: false, errors: [{ code: 'FILE_TOO_LARGE', path: '' }] };
      expect(parseGlyfText(text + ' ')).toMatchObject(tooBig);
      expect(await readGlyfFile(new Blob([bytes, ' ']))).toMatchObject(tooBig);
    },
  );

  it('rejects an oversized Blob before invoking its read method', async () => {
    const file = new Blob([new Uint8Array(GLYF_LIMITS.fileBytes + 1)]);
    const read = vi.spyOn(file, 'arrayBuffer');
    expect(await readGlyfFile(file)).toMatchObject({
      ok: false,
      errors: [{ code: 'FILE_TOO_LARGE', path: '' }],
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('checks byte length before decoding invalid content', () => {
    const bytes = new Uint8Array(GLYF_LIMITS.fileBytes + 1);
    bytes[0] = 0xff;
    expect(parseGlyfBytes(bytes)).toMatchObject({
      ok: false,
      errors: [{ code: 'FILE_TOO_LARGE', path: '' }],
    });
  });

  it('propagates a file read failure separately from document diagnostics', async () => {
    const file = new Blob([header]);
    const error = new DOMException('File unavailable', 'NotReadableError');
    vi.spyOn(file, 'arrayBuffer').mockRejectedValueOnce(error);
    await expect(readGlyfFile(file)).rejects.toBe(error);
  });
});
