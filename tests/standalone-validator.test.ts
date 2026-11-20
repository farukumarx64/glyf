import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import schema from '../schema/mosaic-v0.1.schema.json' with { type: 'json' };
import { validatorOptions } from '../scripts/validator-options.ts';
import matchesSchema from '../src/core/schema-validator.generated.js';
import { minimalDocument, typedDocument } from './fixtures.ts';

// Keep the original compiler as a test-only oracle for the generated module,
// including the complete diagnostic arrays consumed by validateMosaic.
const reference = new Ajv2020(validatorOptions).compile(schema);
const minimal = minimalDocument();

describe('standalone validator compatibility', () => {
  it.each([
    ['minimal valid document', minimal],
    ['all fourteen node types', typedDocument],
    ['wrong version', { ...minimal, mosaic: '0.2.0' }],
    ['missing required field', { mosaic: '0.1.0' }],
    ['unknown property with pointer escapes', { ...minimal, 'a/b~': true }],
    ['unknown node type', { ...minimal, root: { id: 'root', type: 'canvas' } }],
    ['no numeric coercion', { ...minimal, root: { ...minimal.root, gap: '3' } }],
    ['invalid node union field', { ...minimal, root: { ...minimal.root, gap: 1.5 } }],
    ['finite-number enforcement', { ...minimal, state: { amount: Infinity } }],
    ['nullable scalar', { ...minimal, state: { amount: null } }],
    ['Unicode length at limit', { ...minimal, meta: { title: '😀'.repeat(200) } }],
    ['Unicode length over limit', { ...minimal, meta: { title: '😀'.repeat(201) } }],
    [
      'structural resource limit',
      {
        ...minimal,
        state: Object.fromEntries(
          Array.from({ length: 101 }, (_, index) => [`key${index}`, index]),
        ),
      },
    ],
  ])('matches compiled behavior and diagnostics for %s', (_name, value) => {
    const before = structuredClone(value);
    const expected = reference(value);
    const errors = structuredClone(reference.errors ?? null);
    expect(matchesSchema(value)).toBe(expected);
    expect(matchesSchema.errors).toEqual(errors);
    expect(value).toEqual(before);
  });

  it('requires own properties and accepts null-prototype records', () => {
    const inherited = Object.assign(Object.create({ meta: minimal.meta }), minimal);
    delete inherited.meta;
    expect(reference(inherited)).toBe(false);
    expect(matchesSchema(inherited)).toBe(false);
    expect(matchesSchema.errors).toEqual(reference.errors);
    const own = Object.assign(Object.create(null), minimal);
    expect(reference(own)).toBe(true);
    expect(matchesSchema(own)).toBe(true);
    expect(matchesSchema.errors).toBeNull();
  });
});
