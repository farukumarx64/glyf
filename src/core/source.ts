import type { GlyfError, GlyfErrors } from './errors.ts';
import { jsonPointer, ROOT_POINTER, type JsonPointer } from './json-pointer.ts';
import { checkJsonSource } from './json-source.ts';
import { checkResourceLimit } from './limits.ts';
import { checkUtf8Text } from './utf8.ts';

export type SourceResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly errors: GlyfErrors };

function failure(code: GlyfError['code'], path: JsonPointer, message: string): SourceResult {
  return { ok: false, errors: [{ code, path, message }] };
}

// Use the same header diagnostics for source text and in-memory input.
export function checkGlyfHeader(value: unknown): GlyfError | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      code: 'SCHEMA_ERROR',
      path: ROOT_POINTER,
      message: 'A Glyf file must contain one JSON object.',
    };
  }
  const version: unknown = Object.getOwnPropertyDescriptor(value, 'glyf')?.value;
  if (typeof version !== 'string') {
    return {
      code: 'SCHEMA_ERROR',
      path: jsonPointer('glyf'),
      message: 'The document must declare its version in the glyf string field.',
    };
  }
  if (version !== '0.1.0') {
    return {
      code: 'UNSUPPORTED_VERSION',
      path: jsonPointer('glyf'),
      message: 'Unsupported Glyf version. This reader supports version 0.1.0.',
    };
  }
}

function parseSource(text: string): SourceResult {
  const source = text.startsWith('\uFEFF') ? text.slice(1) : text;
  let value: unknown;
  try {
    const error = checkJsonSource(source);
    if (error) return { ok: false, errors: [error] };
    value = JSON.parse(source);
  } catch (cause) {
    // Includes JSON escapes in property names decoded by the scanner.
    if (!(cause instanceof SyntaxError)) throw cause;
    return failure(
      'INVALID_JSON',
      ROOT_POINTER,
      'Malformed JSON. Check the quotes, commas, and delimiters.',
    );
  }

  const headerError = checkGlyfHeader(value);
  return headerError ? { ok: false, errors: [headerError] } : { ok: true, value };
}

export function parseGlyfText(text: string): SourceResult {
  const error = checkUtf8Text(text);
  if (error) return { ok: false, errors: [error] };
  return parseSource(text);
}

export function parseGlyfBytes(bytes: Uint8Array): SourceResult {
  const error = checkResourceLimit('fileBytes', bytes.byteLength, ROOT_POINTER);
  if (error) return { ok: false, errors: [error] };

  let text: string;
  try {
    // Preserve the BOM here. parseSource consumes exactly one on both entry paths.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (cause) {
    if (!(cause instanceof TypeError)) throw cause;
    return failure(
      'INVALID_UTF8',
      ROOT_POINTER,
      'The file contains invalid UTF-8. Save it as UTF-8 and try again.',
    );
  }
  return parseSource(text);
}
