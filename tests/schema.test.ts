import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import originalSchema from '../docs/reference/mosaic-v0.1.schema.json' with { type: 'json' };
import schema from '../schema/mosaic-v0.1.schema.json' with { type: 'json' };
import { validateSchema } from '../scripts/schema-validator.ts';
import { minimalDocument, nodeSamples, typedDocument } from './fixtures.ts';

describe('Mosaic Draft 2020-12 structural contract', () => {
  it('accepts the supplied reference document', () => {
    const value: unknown = JSON.parse(
      readFileSync(new URL('../examples/mosaic-demo.mosa', import.meta.url), 'utf8'),
    );
    expect(validateSchema(value), JSON.stringify(validateSchema.errors)).toBe(true);
  });

  it('changes the supplied schema only by the approved id-column restriction', () => {
    const expected = structuredClone(originalSchema);
    Object.assign(expected.$defs.columnDef.properties.key, { not: { const: 'id' } });
    expect(schema).toEqual(expected);
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
    ['version', { ...minimalDocument(), mosaic: '0.2.0' }],
    ['unknown top-level field', { ...minimalDocument(), script: 'alert(1)' }],
    ['unknown node type', { ...minimalDocument(), root: { id: 'root', type: 'canvas' } }],
    [
      'unknown node field',
      { ...minimalDocument(), root: { ...minimalDocument().root, style: 'red' } },
    ],
    [
      'missing required property',
      { mosaic: '0.1.0', id: 'missing_root', meta: { title: 'Missing' } },
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
      '{"mosaic":"0.1.0","id":"overflow","meta":{"title":"Overflow"},' +
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
