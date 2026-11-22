import { assertType, describe, expect, it } from 'vitest';
import { GLYF_ERROR_CODES } from '../src/core/errors.ts';
import type { GlyfError, GlyfErrorCode, ParseResult } from '../src/core/errors.ts';
import { jsonPointer, ROOT_POINTER } from '../src/core/json-pointer.ts';
import { minimalDocument } from './fixtures.ts';

describe('public diagnostic contract', () => {
  it('serializes only the stable code, pointer, and human-readable message', () => {
    const error: GlyfError = {
      code: 'INVALID_BINDING',
      path: jsonPointer('root', 'children', 2, 'bind'),
      message: 'State key "missing" does not exist.',
    };
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      code: 'INVALID_BINDING',
      path: '/root/children/2/bind',
      message: 'State key "missing" does not exist.',
    });
  });

  it('keeps the public code catalog immutable at runtime', () => {
    expect(Object.isFrozen(GLYF_ERROR_CODES)).toBe(true);
    expect(Reflect.set(GLYF_ERROR_CODES, '0', 'TYPO')).toBe(false);
    expect(GLYF_ERROR_CODES[0]).toBe('FILE_TOO_LARGE');
  });

  it('narrows success and failure without treating schema-only output as a document', () => {
    const error: GlyfError = {
      code: 'INVALID_JSON',
      path: ROOT_POINTER,
      message: 'Malformed JSON.',
    };
    const results: ParseResult[] = [
      { ok: true, document: minimalDocument() },
      { ok: false, errors: [error] },
    ];
    for (const result of results) {
      if (result.ok) {
        expect(result.document.glyf).toBe('0.1.0');
      } else {
        // noUncheckedIndexedAccess still knows errors[0] exists.
        expect(result.errors[0].code).toBe('INVALID_JSON');
      }
    }
  });

  it('typechecks code spelling, pointer construction, and non-empty failure lists', () => {
    assertType<GlyfErrorCode>('SCHEMA_ERROR');
    // @ts-expect-error Unknown or misspelled codes must not enter the API.
    assertType<GlyfErrorCode>('SCHEMA_EROR');
    // @ts-expect-error A failed result must include at least one diagnostic.
    assertType<ParseResult>({ ok: false, errors: [] });
    assertType<GlyfError>({
      code: 'INVALID_JSON',
      // @ts-expect-error Raw strings must be constructed or checked as JSON Pointers.
      path: '/bad~escape',
      message: 'Malformed JSON.',
    });
  });
});
