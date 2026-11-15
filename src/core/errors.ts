import type { JsonPointer } from './json-pointer.ts';
import type { MosaicDocument } from './types.ts';

/** Stable categories from the v0.1 specification; messages are for people. */
export const MOSAIC_ERROR_CODES = Object.freeze([
  'FILE_TOO_LARGE',
  'INVALID_UTF8',
  'INVALID_JSON',
  'UNSUPPORTED_VERSION',
  'SCHEMA_ERROR',
  'DUPLICATE_ID',
  'INVALID_ROOT',
  'INVALID_BINDING',
  'INVALID_DATASET',
  'RESOURCE_LIMIT',
] as const);

export type MosaicErrorCode = (typeof MOSAIC_ERROR_CODES)[number];

/** Plain, JSON-serializable diagnostics; no document copies or validator internals. */
export interface MosaicError {
  readonly code: MosaicErrorCode;
  /** Empty string for a file/document-wide error, otherwise a JSON Pointer. */
  readonly path: JsonPointer;
  readonly message: string;
}

/** A failure must explain itself with at least one diagnostic. */
export type MosaicErrors = readonly [MosaicError, ...MosaicError[]];

/** A successful document has passed preflight, schema, and semantic validation. */
export type ParseResult =
  | { readonly ok: true; readonly document: MosaicDocument }
  | { readonly ok: false; readonly errors: MosaicErrors };
