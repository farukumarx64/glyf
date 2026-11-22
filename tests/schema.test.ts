import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import originalSchema from '../docs/reference/mosaic-v0.1.schema.json' with { type: 'json' };
import schema from '../schema/glyf-v0.1.schema.json' with { type: 'json' };
import { validateSchema } from '../scripts/schema-validator.ts';
import { minimalDocument, nodeSamples, typedDocument } from './fixtures.ts';

describe('Glyf Draft 2020-12 structural contract', () => {
  it('accepts the current Glyf demo', () => {
    const value: unknown = JSON.parse(
      readFileSync(new URL('../examples/glyf-demo.glyf', import.meta.url), 'utf8'),
    );
    expect(validateSchema(value), JSON.stringify(validateSchema.errors)).toBe(true);
  });

  it('changes the supplied schema only by the approved identity and id-column amendments', () => {
    const expected = structuredClone(originalSchema);
    Object.assign(expected.$defs.columnDef.properties.key, { not: { const: 'id' } });
    const { mosaic: version, ...properties } = expected.properties;
    expect(schema).toEqual({
      ...expected,
      $id: 'https://github.com/farukumarx64/mosaic/blob/main/schema/glyf-v0.1.schema.json',
      title: 'Glyf document 0.1.0',
      description:
        'Provisional schema for Glyf .glyf documents, version 0.1.0; semantic validation is additionally required.',
      required: expected.required.map((key) => (key === 'mosaic' ? 'glyf' : key)),
      properties: { glyf: version, ...properties },
    });
  });

  it('keeps the TypeScript fixture vocabulary aligned with the schema', () => {
    const names = schema.$defs.node.oneOf.map(({ $ref }) => $ref.split('/').at(-1));
    expect(Object.keys(nodeSamples).sort()).toEqual(names.sort());
    expect(validateSchema(typedDocument), JSON.stringify(validateSchema.errors)).toBe(true);
  });

  it.each(Object.values(nodeSamples))('accepts the typed $type node fixture', (node) => {
    const value = { ...minimalDocument(), root: { ...minimalDocument().root, children: [node] } };
    expect(validateSchema(value), JSON.stringify(validateSchema.errors)).toBe(true);
  });

  it('accepts a minimal document without adding defaults or mutating it', () => {
    const value = minimalDocument();
    const before = structuredClone(value);
    expect(validateSchema(value)).toBe(true);
    expect(value).toEqual(before);
  });

  it('rejects id as a column key while permitting row id metadata', () => {
    const value = structuredClone(typedDocument);
    expect(validateSchema(value)).toBe(true);
    value.datasets.values.columns[0]!.key = 'id';
    expect(validateSchema(value)).toBe(false);
    expect(validateSchema.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          instancePath: '/datasets/values/columns/0/key',
          keyword: 'not',
        }),
      ]),
    );
  });

  it.each([
    ['version', { ...minimalDocument(), glyf: '0.2.0' }],
    ['unknown top-level field', { ...minimalDocument(), script: 'alert(1)' }],
    ['unknown node type', { ...minimalDocument(), root: { id: 'root', type: 'canvas' } }],
    [
      'unknown node field',
      { ...minimalDocument(), root: { ...minimalDocument().root, style: 'red' } },
    ],
    [
      'missing required property',
      { glyf: '0.1.0', id: 'missing_root', meta: { title: 'Missing' } },
    ],
    ['numeric string', { ...minimalDocument(), root: { ...minimalDocument().root, gap: '3' } }],
    ['invalid theme', { ...minimalDocument(), theme: { accent: 'purple' } }],
    ['non-scalar state', { ...minimalDocument(), state: { value: {} } }],
  ])('rejects %s without altering the input', (_name, value) => {
    const before = structuredClone(value);
    expect(validateSchema(value)).toBe(false);
    expect(value).toEqual(before);
  });

  it.each([NaN, Infinity, -Infinity])(
    'rejects non-finite number %s throughout scalar fields',
    (value) => {
      expect(validateSchema({ ...minimalDocument(), state: { value } })).toBe(false);
      const datasetDocument = structuredClone(typedDocument);
      datasetDocument.datasets.values.rows[0]!.amount = value;
      expect(validateSchema(datasetDocument)).toBe(false);
      expect(
        validateSchema({
          ...minimalDocument(),
          root: { id: 'root', type: 'column', children: [{ ...nodeSamples.when, equals: value }] },
        }),
      ).toBe(false);
    },
  );

  it('rejects a syntactically valid numeric literal that overflows during JSON parsing', () => {
    const value: unknown = JSON.parse(
      '{"glyf":"0.1.0","id":"overflow","meta":{"title":"Overflow"},' +
        '"state":{"value":1e400},"root":{"id":"root","type":"column","children":[]}}',
    );
    expect(validateSchema(value)).toBe(false);
  });

  it.each([
    [0, true],
    [6, true],
    [-1, false],
    [7, false],
    [1.5, false],
  ])('validates gap %s at its integer boundaries', (gap, valid) => {
    expect(validateSchema({ ...minimalDocument(), root: { ...minimalDocument().root, gap } })).toBe(
      valid,
    );
  });

  it.each([
    [20_000, true],
    [20_001, false],
  ])('validates Markdown length %s', (length, valid) => {
    expect(
      validateSchema({
        ...minimalDocument(),
        root: {
          ...minimalDocument().root,
          children: [{ ...nodeSamples.markdown, text: 'x'.repeat(length) }],
        },
      }),
    ).toBe(valid);
  });
});

describe('v0.1 field boundaries', () => {
  it.each([
    ['title', 200],
    ['description', 1000],
    ['locale', 32],
  ] as const)('enforces the metadata %s maximum of %i Unicode code points', (field, limit) => {
    const doc = minimalDocument();
    const make = (length: number) => ({
      ...doc,
      meta: { ...doc.meta, [field]: '雪'.repeat(length) },
    });
    expect(validateSchema(make(limit))).toBe(true);
    expect(validateSchema(make(limit + 1))).toBe(false);
  });

  it.each([
    [nodeSamples.heading, 'text', 500],
    [nodeSamples.text, 'text', 10000],
    [nodeSamples.card, 'title', 120],
    [nodeSamples.chart, 'title', 120],
    [nodeSamples.input, 'label', 120],
    [nodeSamples.toggle, 'label', 120],
    [nodeSamples.stateValue, 'prefix', 120],
    [nodeSamples.stateValue, 'suffix', 120],
  ] as const)('enforces the %j field %s maximum of %i code points', (node, field, limit) => {
    const make = (length: number) => ({
      ...typedDocument,
      root: { ...typedDocument.root, children: [{ ...node, [field]: '😀'.repeat(length) }] },
    });
    expect(validateSchema(make(limit))).toBe(true);
    expect(validateSchema(make(limit + 1))).toBe(false);
  });

  it.each([
    [nodeSamples.heading, 'level', 1, 4],
    [nodeSamples.grid, 'columns', 1, 4],
    [nodeSamples.row, 'gap', 0, 6],
    [nodeSamples.grid, 'gap', 0, 6],
  ] as const)(
    'enforces both ends of the integer interval for %j field %s',
    (node, field, min, max) => {
      for (const [value, valid] of [
        [min, true],
        [max, true],
        [min - 1, false],
        [max + 1, false],
        [min + 0.5, false],
      ] as const) {
        expect(
          validateSchema({
            ...typedDocument,
            root: { ...typedDocument.root, children: [{ ...node, [field]: value }] },
          }),
        ).toBe(valid);
      }
    },
  );

  it('requires a nonempty title and at least one column, while allowing an empty dataset', () => {
    const doc = minimalDocument();
    expect(validateSchema({ ...doc, meta: { title: '' } })).toBe(false);
    expect(validateSchema({ ...doc, meta: { title: 'A' } })).toBe(true);
    const dataset = (label: string) => ({
      columns: [{ key: 'x', kind: 'number', label }],
      rows: [],
    });
    expect(validateSchema({ ...doc, datasets: { empty: { columns: [], rows: [] } } })).toBe(false);
    expect(validateSchema({ ...doc, datasets: { empty: dataset('😀'.repeat(100)) } })).toBe(true);
    expect(validateSchema({ ...doc, datasets: { empty: dataset('😀'.repeat(101)) } })).toBe(false);
  });
});
