import type { MosaicError, MosaicErrors } from './errors.ts';
import { jsonPointer, ROOT_POINTER, type JsonPointer } from './json-pointer.ts';
import { checkJsonSource } from './json-source.ts';
import { checkResourceLimit, MOSAIC_LIMITS } from './limits.ts';

export type SourceResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly errors: MosaicErrors };

function failure(code: MosaicError['code'], path: JsonPointer, message: string): SourceResult {
  return { ok: false, errors: [{ code, path, message }] };
}

// Use the same header diagnostics for source text and in-memory input.
export function checkMosaicHeader(value: unknown): MosaicError | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      code: 'SCHEMA_ERROR',
      path: ROOT_POINTER,
      message: 'A Mosaic file must contain one JSON object.',
    };
  }
  const version: unknown = Object.getOwnPropertyDescriptor(value, 'mosaic')?.value;
  if (typeof version !== 'string') {
    return {
      code: 'SCHEMA_ERROR',
      path: jsonPointer('mosaic'),
      message: 'The document must declare its version in the mosaic string field.',
    };
  }
  if (version !== '0.1.0') {
    return {
      code: 'UNSUPPORTED_VERSION',
      path: jsonPointer('mosaic'),
      message: 'Unsupported Mosaic version. This reader supports version 0.1.0.',
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

  const headerError = checkMosaicHeader(value);
  return headerError ? { ok: false, errors: [headerError] } : { ok: true, value };
}

// Measure supplied JS strings without allocating an encoded copy. UTF-16 length
// is a lower bound, so an oversized string can be rejected immediately.
function checkSourceText(text: string): MosaicError | undefined {
  const max = MOSAIC_LIMITS.fileBytes;
  const tooLarge: MosaicError = {
    code: 'FILE_TOO_LARGE',
    path: ROOT_POINTER,
    message: `Source text exceeds the limit of ${max} UTF-8 bytes.`,
  };
  let bytes = text.length;
  if (bytes > max) return tooLarge;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) continue;
    if (unit < 0x800) bytes++;
    else if (unit >= 0xd800 && unit <= 0xdfff) {
      const next = text.charCodeAt(i + 1);
      if (unit > 0xdbff || !(next >= 0xdc00 && next <= 0xdfff)) {
        return {
          code: 'INVALID_UTF8',
          path: ROOT_POINTER,
          message:
            'Source text contains an unpaired surrogate that cannot be represented in UTF-8.',
        };
      }
      i++;
      bytes += 2; // Already counted both UTF-16 units; this pair takes four bytes.
    } else bytes += 2;
    if (bytes > max) return tooLarge;
  }
  return undefined;
}

export function parseMosaicText(text: string): SourceResult {
  const error = checkSourceText(text);
  if (error) return { ok: false, errors: [error] };
  return parseSource(text);
}

export function parseMosaicBytes(bytes: Uint8Array): SourceResult {
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
