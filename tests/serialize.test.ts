import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { readMosaicFile } from '../src/core/file.ts';
import { MOSAIC_LIMITS } from '../src/core/limits.ts';
import { parseMosaic } from '../src/core/parse.ts';
import { MosaicSerializationError, serializeMosaic } from '../src/core/serialize.ts';
import type { MosaicDocument } from '../src/core/types.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { minimalDocument, typedDocument } from './fixtures.ts';

function exportError(doc: MosaicDocument): MosaicSerializationError {
  try {
    serializeMosaic(doc);
  } catch (error) {
    if (error instanceof MosaicSerializationError) return error;
    throw error;
  }
  throw new Error('Expected the serializer to reject the document.');
}

const utf8 = new TextEncoder();
const maxBytes = MOSAIC_LIMITS.fileBytes;

// Compute the fixture size independently with the native formatter and encoder.
// A state string has no per-field length limit, so only the file budget applies.
function sizedDocument(size: number, character: string) {
  const doc = { ...minimalDocument(), state: { note: '' } };
  const emptySize = utf8.encode(JSON.stringify(doc, null, 2) + '\n').byteLength;
  const available = size - emptySize;
  const unit = utf8.encode(JSON.stringify(character).slice(1, -1)).byteLength;
  doc.state.note = character.repeat(Math.floor(available / unit)) + 'a'.repeat(available % unit);
  return doc;
}

describe('Mosaic v0.1 serialization', () => {
  it('writes two-space JSON and one final LF, omitting a source BOM and optional fields', () => {
    const source = '\uFEFF' + JSON.stringify(minimalDocument()) + '\r\n\r\n';
    const parsed = parseMosaic(source);
    if (!parsed.ok) throw new Error(parsed.errors[0].message);
    expect(serializeMosaic(parsed.document)).toBe(
      [
        '{',
        '  "mosaic": "0.1.0",',
        '  "id": "minimal",',
        '  "meta": {',
        '    "title": "Minimal document"',
        '  },',
        '  "root": {',
        '    "id": "root",',
        '    "type": "column",',
        '    "children": []',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('reopens the reference document through UTF-8 file import and gives identical output on a second export', async () => {
    const original = readFileSync(new URL('../examples/mosaic-demo.mosa', import.meta.url), 'utf8');
    const parsed = parseMosaic(original);
    if (!parsed.ok) throw new Error(parsed.errors[0].message);
    const hidden = { ...parsed.document, state: { ...parsed.document.state, showChart: false } };
    expect(parseMosaic(serializeMosaic(hidden))).toStrictEqual({ ok: true, document: hidden });
    const text = serializeMosaic(parsed.document);
    expect(text).toBe(JSON.stringify(parsed.document, null, 2) + '\n');
    const file = new File([utf8.encode(text)], 'roundtrip.mosa');
    const source = await readMosaicFile(file);
    const reopened = source.ok ? validateMosaic(source.value) : source;
    expect(reopened).toStrictEqual(parsed);
    if (!reopened.ok) throw new Error(reopened.errors[0].message);
    expect(serializeMosaic(reopened.document)).toBe(text);
  });

  it('preserves edited cells and state, IDs, column, row and child order, and hidden nodes', () => {
    const doc = {
      ...structuredClone(typedDocument),
      state: { ...typedDocument.state, visible: false },
    };
    doc.datasets.values.rows[0]!.amount = -25.125;
    doc.datasets.values.rows[1]!.label = '';
    doc.state.note = 'quoted "note"\r\nÉ 雪 😀 \\ \ud800';
    doc.state.count = 0;
    doc.root.children.reverse();
    doc.datasets.values.rows.reverse();
    doc.datasets.values.columns.reverse();
    const saved = structuredClone(doc);
    const output = serializeMosaic(doc);
    expect(parseMosaic(output)).toStrictEqual({ ok: true, document: saved });
    expect(doc).toStrictEqual(saved);
  });

  it('uses native JSON representations for finite numbers, including signed zero', () => {
    const doc = {
      ...minimalDocument(),
      state: { smallest: Number.MIN_VALUE, largest: Number.MAX_VALUE, zero: -0 },
    };
    const text = serializeMosaic(doc);
    expect(text).toBe(JSON.stringify(doc, null, 2) + '\n');
    expect(parseMosaic(text)).toStrictEqual({
      ok: true,
      document: { ...doc, state: { ...doc.state, zero: 0 } },
    });
    expect(Object.is(doc.state.zero, -0)).toBe(true);
  });

  it('retains every validation diagnostic and allows an invalid edit to be corrected and retried', () => {
    const doc = structuredClone(typedDocument);
    expect(validateMosaic(doc).ok).toBe(true);
    doc.datasets.values.rows[1]!.id = doc.datasets.values.rows[0]!.id;
    const before = structuredClone(doc);
    const error = exportError(doc);
    expect({ ok: false, errors: error.errors }).toStrictEqual(validateMosaic(doc));
    expect(error.errors[0]).toMatchObject({
      code: 'DUPLICATE_ID',
      path: '/datasets/values/rows/1/id',
    });
    expect(error.message).toContain('/datasets/values/rows/1/id');
    expect(doc).toStrictEqual(before);
    doc.datasets.values.rows[1]!.id = 'corrected';
    expect(parseMosaic(serializeMosaic(doc))).toStrictEqual({ ok: true, document: doc });
  });

  it('blocks extra UI fields, non-finite edits, and cycles before JSON writing', () => {
    const withUi = { ...minimalDocument(), dirty: true };
    expect(exportError(withUi).errors[0]).toMatchObject({ code: 'SCHEMA_ERROR', path: '/dirty' });
    const nonfinite = { ...minimalDocument(), state: { value: NaN } };
    expect(exportError(nonfinite).errors[0]).toMatchObject({
      code: 'SCHEMA_ERROR',
      path: '/state/value',
    });
    expect(nonfinite.state.value).toBeNaN();
    const cyclic = minimalDocument();
    Object.assign(cyclic.root, { children: [cyclic.root] });
    expect(exportError(cyclic).errors[0]).toMatchObject({
      code: 'SCHEMA_ERROR',
      path: '/root/children/0',
    });
  });

  it('rejects custom JSON hooks before they run and permits ordinary keys named toJSON', () => {
    const hook = vi.fn(() => 'unrelated');
    const own = Object.assign(minimalDocument(), { toJSON: hook });
    expect(exportError(own).errors[0]).toMatchObject({ code: 'SCHEMA_ERROR', path: '/toJSON' });
    // Keep the foreign prototype isolated from the test runner.
    const state = runInNewContext(
      "Object.defineProperty(Object.prototype, 'toJSON', { get: hook }); ({ note: 'keep' })",
      { hook },
    );
    expect(exportError({ ...minimalDocument(), state }).errors[0]).toMatchObject({
      code: 'SCHEMA_ERROR',
      path: '/state',
    });
    expect(hook).not.toHaveBeenCalled();
    const ordinary = { ...minimalDocument(), state: { toJSON: 'keep', rawJSON: '42' } };
    expect(parseMosaic(serializeMosaic(ordinary))).toStrictEqual({ ok: true, document: ordinary });
  });

  const rawJSON =
    'rawJSON' in JSON && typeof JSON.rawJSON === 'function' ? JSON.rawJSON : undefined;
  it.skipIf(!rawJSON)(
    'rejects a raw JSON wrapper whose native output would replace the state object',
    () => {
      const doc = { ...minimalDocument(), state: rawJSON!('42') };
      expect(exportError(doc).errors[0]).toMatchObject({ code: 'SCHEMA_ERROR', path: '/state' });
    },
  );
});

describe('final UTF-8 export budget', () => {
  it.each(['a', 'é', '雪', '😀', '\u0000'])(
    'accepts exactly 5 MiB and rejects the extra newline byte with %j',
    (character) => {
      const doc = sizedDocument(maxBytes, character);
      const text = serializeMosaic(doc);
      expect(utf8.encode(text).byteLength).toBe(maxBytes);
      expect(parseMosaic(text).ok).toBe(true);
      const edited = doc.state.note + 'a';
      doc.state.note = edited;
      // Without the mandatory final LF this edited export would fit exactly.
      expect(utf8.encode(JSON.stringify(doc, null, 2)).byteLength).toBe(maxBytes);
      expect(exportError(doc).errors[0]).toMatchObject({ code: 'FILE_TOO_LARGE', path: '' });
      expect(doc.state.note).toBe(edited);
    },
  );

  it('can open a compact document whose formatted export is too large, then retry after an edit', () => {
    const doc = sizedDocument(maxBytes + 1, '😀');
    const compact = JSON.stringify(doc);
    expect(utf8.encode(compact).byteLength).toBeLessThan(maxBytes);
    const parsed = parseMosaic(compact);
    if (!parsed.ok) throw new Error(parsed.errors[0].message);
    expect(exportError(parsed.document).errors[0]).toMatchObject({
      code: 'FILE_TOO_LARGE',
      path: '',
    });
    expect(parsed.document.state?.note).toBe(doc.state.note);
    const revised = {
      ...parsed.document,
      state: { ...parsed.document.state, note: sizedDocument(maxBytes - 1, '😀').state.note },
    };
    const exported = serializeMosaic(revised);
    expect(utf8.encode(exported).byteLength).toBe(maxBytes - 1);
    expect(parseMosaic(exported)).toStrictEqual({ ok: true, document: revised });
  });

  it('counts every occurrence of shared string content in a direct document', () => {
    const note = 'x'.repeat(1024 * 1024);
    const state = Object.fromEntries(Array.from({ length: 12 }, (_, i) => ['note' + i, note]));
    const doc = { ...minimalDocument(), state };
    expect(validateMosaic(doc).ok).toBe(true);
    expect(exportError(doc).errors[0]).toMatchObject({ code: 'FILE_TOO_LARGE', path: '' });
    expect(doc.state.note11).toBe(note);
  });
});
