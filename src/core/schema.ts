import type { ErrorObject } from 'ajv';
import type { MosaicError } from './errors.ts';
import type { MosaicDocument, MosaicNode } from './types.ts';
import { preflightMosaic } from './preflight.ts';
import matchesSchema from './schema-validator.generated.js';

// The schema accepts any known node at the root. The semantic stage narrows it.
export type StructuralDocument = Omit<MosaicDocument, 'root'> & { readonly root: MosaicNode };

type StructureResult =
  { ok: true; document: StructuralDocument } | { ok: false; problem: MosaicError | ErrorObject[] };

/** Internal shared boundary for the core API and the schema conformance tools. */
export function checkStructure(value: unknown): StructureResult {
  const error = preflightMosaic(value);
  if (error) return { ok: false, problem: error };
  if (!matchesSchema(value)) return { ok: false, problem: matchesSchema.errors! };
  return { ok: true, document: value };
}
