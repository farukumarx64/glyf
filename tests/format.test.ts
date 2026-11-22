import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readGlyfFile } from '../src/core/file.ts';
import { parseGlyf, parseGlyfBytes } from '../src/core/parse.ts';
import { GlyfSerializationError, serializeGlyf } from '../src/core/serialize.ts';
import type { Dataset, GlyfDocument, GlyfNode, GlyfScalar } from '../src/core/types.ts';
import { validateGlyf } from '../src/core/validate.ts';
import { minimalDocument, nodeSamples, typedDocument } from './fixtures.ts';

const utf8 = new TextEncoder();

function fixture(name: string) {
  return readFileSync(new URL('../examples/invalid/' + name + '.glyf', import.meta.url));
}

function roundTrip(source: string, expected: GlyfDocument) {
  const first = parseGlyf(source);
  if (!first.ok) throw new Error(JSON.stringify(first.errors));
  expect(first.document).toStrictEqual(expected);
  const formatted = serializeGlyf(first.document);
  const second = parseGlyf(formatted);
  if (!second.ok) throw new Error(JSON.stringify(second.errors));
  expect(second.document).toStrictEqual(expected);
  expect(serializeGlyf(second.document)).toBe(formatted);
  return formatted;
}

// Use published v0.1 numbers as independent expectations. Build large inputs in memory.
function documentAtAllLimits() {
  const columns = Array.from({ length: 30 }, (_, i) => ({
    key: 'c' + i,
    label: 'Column ' + i,
    kind: 'number' as const,
  }));
  // 1,000 × 20 cells. Only the first 500 rows have a non-null chart y.
  const dataColumns = columns.slice(0, 20);
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    ...Object.fromEntries(dataColumns.map(({ key }) => [key, key === 'c1' && i >= 500 ? null : i])),
    id: 'r' + i,
  }));
  const datasets: Record<string, Dataset> = { data: { columns: dataColumns, rows } };
  for (let i = 1; i < 20; i++) datasets['empty' + i] = { columns, rows: [] };
  const state: Record<string, GlyfScalar> = { visible: false, note: '' };
  for (let i = 2; i < 100; i++) state['s' + i] = null;

  let branch: GlyfNode = {
    id: 'plot',
    type: 'chart',
    kind: 'line',
    dataset: 'data',
    x: 'c0',
    y: 'c1',
  };
  for (let depth = 19; depth >= 3; depth--)
    branch = { id: 'card' + depth, type: 'card', children: [branch] };
  const hidden: GlyfNode = {
    id: 'hidden',
    type: 'when',
    bind: 'visible',
    equals: true,
    children: [branch],
  };
  // Root through chart takes 20 positions. Markdown and 1,979 siblings bring the total to 2,000.
  const siblings = Array.from({ length: 1979 }, (_, i) => ({
    id: 'line' + i,
    type: 'divider' as const,
  }));
  const doc: GlyfDocument = {
    ...minimalDocument(),
    datasets,
    state,
    root: {
      ...minimalDocument().root,
      children: [hidden, { id: 'md', type: 'markdown', text: '😀'.repeat(20000) }, ...siblings],
    },
  };
  const bytes = utf8.encode(JSON.stringify(doc, null, 2) + '\n').byteLength;
  state.note = 'a'.repeat(5_242_880 - bytes);
  return doc;
}

function freezeDocument(value: unknown) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDocument(child);
}

describe('v0.1 file conformance', () => {
  it.each([
    ['unsupported-version', 'UNSUPPORTED_VERSION', '/glyf'],
    ['duplicate-node-id', 'DUPLICATE_ID', '/root/children/1/children/0/id'],
    ['missing-binding', 'INVALID_BINDING', '/root/children/0/children/0/bind'],
    ['wrong-column-type', 'INVALID_DATASET', '/datasets/sales/rows/0/amount'],
  ])(
    'rejects the %s fixture at the specified location through file and text import',
    async (name, code, path) => {
      const bytes = fixture(name);
      const parsed = parseGlyf(bytes.toString('utf8'));
      expect(parsed).toMatchObject({ ok: false, errors: [{ code, path }] });
      const source = await readGlyfFile(new File([new Uint8Array(bytes)], name + '.glyf'));
      expect(source.ok ? validateGlyf(source.value) : source).toStrictEqual(parsed);
    },
  );

  it('preserves literal markup inside a Markdown string through parse–serialize–parse', () => {
    const text = fixture('malicious-markdown').toString('utf8');
    const expected: GlyfDocument = JSON.parse(text);
    expect(expected.root.children[0]).toMatchObject({
      type: 'markdown',
      text: expect.stringContaining('<script type="application/json">'),
    });
    roundTrip(text, expected);
  });

  it('round-trips all 14 node kinds from a BOM-prefixed compact source', () => {
    roundTrip('\uFEFF' + JSON.stringify(typedDocument), typedDocument);
  });

  it('preserves distinct identifier scopes and resolves 64-character references exactly', () => {
    const key = 'K' + 'a_0'.repeat(21);
    const id = 'I' + 'a-0'.repeat(21);
    const column = { key, kind: 'number' as const, label: 'Value' };
    const row = { id, [key]: 0 };
    const dataset = { columns: [column], rows: [row] };
    const chart = { ...nodeSamples.chart, id: 'Plot', dataset: key, x: key, y: key };
    const doc: GlyfDocument = {
      ...minimalDocument(),
      id,
      state: { [key]: false },
      datasets: { [key]: dataset },
      root: {
        type: 'row',
        id,
        children: [chart, { ...nodeSamples.toggle, id: 'plot', bind: key }],
      },
    };
    roundTrip(JSON.stringify(doc), doc);
    const over = key + 'z';
    for (const [invalid, path] of [
      [{ ...doc, id: id + 'z' }, '/id'],
      [{ ...doc, root: { ...doc.root, id: id + 'z' } }, '/root/id'],
      [{ ...doc, state: { [over]: false } }, '/state/' + over],
      [{ ...doc, datasets: { [over]: dataset } }, '/datasets/' + over],
      [
        { ...doc, datasets: { [key]: { ...dataset, columns: [{ ...column, key: over }] } } },
        '/datasets/' + key + '/columns/0/key',
      ],
      [
        { ...doc, datasets: { [key]: { ...dataset, rows: [{ ...row, id: id + 'z' }] } } },
        '/datasets/' + key + '/rows/0/id',
      ],
      [{ ...doc, root: { ...doc.root, children: [{ ...chart, x: over }] } }, '/root/children/0/x'],
      [{ ...doc, state: { [id]: false } }, '/state/' + id], // Hyphens are allowed in IDs only.
    ] as const) {
      expect(parseGlyf(JSON.stringify(invalid))).toMatchObject({
        ok: false,
        errors: [{ code: 'SCHEMA_ERROR', path }],
      });
    }
  });

  it('rejects an escaped duplicate cell name before either value can become the saved value', () => {
    const text = fixture('wrong-column-type')
      .toString('utf8')
      .replace(/"amount"\s*:\s*"12"/u, '"amount": 12, "am\\u006funt": 13');
    expect(parseGlyf(text)).toMatchObject({
      ok: false,
      errors: [{ code: 'INVALID_JSON', path: '/datasets/sales/rows/0/amount' }],
    });
  });

  it('round-trips all ten inclusive limits together and rejects one extra byte at import', () => {
    const doc = documentAtAllLimits();
    const formatted = roundTrip(JSON.stringify(doc), doc);
    expect(utf8.encode(formatted).byteLength).toBe(5_242_880);
    expect(parseGlyf(formatted + '\n')).toMatchObject({
      ok: false,
      errors: [{ code: 'FILE_TOO_LARGE', path: '' }],
    });
  });

  it('accepts deeply frozen input and preserves the input on a semantic failure', () => {
    const doc = structuredClone(typedDocument);
    const invalid = {
      ...doc,
      root: { ...doc.root, children: [{ ...nodeSamples.toggle }] },
      state: { ...doc.state, visible: 'false' },
    };
    const validBefore = structuredClone(doc);
    const invalidBefore = structuredClone(invalid);
    freezeDocument(doc);
    freezeDocument(invalid);
    const valid = validateGlyf(doc);
    expect(valid.ok && valid.document).toBe(doc);
    expect(parseGlyf(serializeGlyf(doc))).toStrictEqual({ ok: true, document: validBefore });
    const result = validateGlyf(invalid);
    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: 'INVALID_BINDING', path: '/root/children/0/bind' }],
    });
    if (result.ok) throw new Error('Expected the invalid control binding to fail.');
    expect(() => serializeGlyf(invalid)).toThrowError(
      expect.objectContaining({
        name: GlyfSerializationError.name,
        errors: result.errors,
      }),
    );
    expect(doc).toStrictEqual(validBefore);
    expect(invalid).toStrictEqual(invalidBefore);
  });

  it.each([
    {
      name: 'valid source',
      bytes: utf8.encode('\uFEFF' + JSON.stringify(minimalDocument())),
      ok: true,
    },
    {
      name: 'truncated UTF-8',
      bytes: new Uint8Array([0xef, 0xbb, 0xbf, 0xe2, 0x82]),
      ok: false,
      code: 'INVALID_UTF8',
    },
    {
      name: 'duplicate property',
      bytes: utf8.encode('{"glyf":"0.1.0","glyf":"0.1.0"}'),
      ok: false,
      code: 'INVALID_JSON',
    },
  ])('leaves the complete backing buffer untouched for $name', ({ bytes, ok, code }) => {
    const buffer = new Uint8Array([0xff, ...bytes, 0xfe]);
    const before = buffer.slice();
    const result = parseGlyfBytes(buffer.subarray(1, buffer.length - 1));
    if (ok) expect(result).toStrictEqual({ ok: true, value: minimalDocument() });
    else expect(result).toMatchObject({ ok: false, errors: [{ code }] });
    expect(buffer).toStrictEqual(before);
  });
});
