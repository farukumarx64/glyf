import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readGlyfFile } from '../src/core/file.ts';
import { parseGlyf } from '../src/core/parse.ts';
import { serializeGlyf, GlyfSerializationError } from '../src/core/serialize.ts';
import { validateGlyf } from '../src/core/validate.ts';
import { minimalDocument } from './fixtures.ts';

describe('Glyf format identity', () => {
  it('opens and round-trips the current demo without changing its values', async () => {
    const text = readFileSync(new URL('../examples/glyf-demo.glyf', import.meta.url), 'utf8');
    const expected: unknown = JSON.parse(text);
    const source = await readGlyfFile(new File([text], 'demo.glyf'));
    const result = source.ok ? validateGlyf(source.value) : source;
    expect(result).toEqual({ ok: true, document: expected });
    if (!result.ok) throw new Error('Expected a valid demo');
    const serialized = serializeGlyf(result.document);
    const reopened = await readGlyfFile(new File([serialized], 'saved.glyf'));
    expect(reopened.ok ? validateGlyf(reopened.value) : reopened).toEqual(result);
    expect(result.document).toEqual(expected);
    expect(result.document.glyf).toBe('0.1.0');
    expect(Object.hasOwn(result.document, 'mosaic')).toBe(false);
  });

  it.each(['original.mosa', 'renamed.glyf'])(
    'rejects the historical marker in %s without migrating or mutating it',
    async (name) => {
      const text = readFileSync(
        new URL('../docs/reference/mosaic-demo.mosa', import.meta.url),
        'utf8',
      );
      const original: unknown = JSON.parse(text);
      const before = structuredClone(original);
      const failure = { ok: false, errors: [{ code: 'SCHEMA_ERROR', path: '/glyf' }] };
      expect(parseGlyf(text)).toMatchObject(failure);
      expect(await readGlyfFile(new File([text], name))).toMatchObject(failure);
      expect(validateGlyf(original)).toMatchObject(failure);
      // @ts-expect-error Deliberately exercise the runtime guard for unvalidated input.
      expect(() => serializeGlyf(original)).toThrow(GlyfSerializationError);
      expect(original).toEqual(before);
    },
  );

  it('rejects a mixed identity instead of silently dropping the historical field', () => {
    const value = { ...minimalDocument(), mosaic: '0.1.0' };
    const before = structuredClone(value);
    const failure = { ok: false, errors: [{ code: 'SCHEMA_ERROR', path: '/mosaic' }] };
    expect(parseGlyf(JSON.stringify(value))).toMatchObject(failure);
    expect(validateGlyf(value)).toMatchObject(failure);
    expect(() => serializeGlyf(value)).toThrow(GlyfSerializationError);
    expect(value).toEqual(before);
  });
});
