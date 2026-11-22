import type { ErrorObject } from 'ajv';
import type { GlyfError } from './errors.ts';
import type { GlyfDocument, GlyfNode } from './types.ts';
import { preflightGlyf } from './preflight.ts';
import matchesSchema from './schema-validator.generated.js';

// The schema accepts any known node at the root. The semantic stage narrows it.
export type StructuralDocument = Omit<GlyfDocument, 'root'> & { readonly root: GlyfNode };

type StructureResult =
  { ok: true; document: StructuralDocument } | { ok: false; problem: GlyfError | ErrorObject[] };

/** Internal shared boundary for the core API and the schema conformance tools. */
export function checkStructure(value: unknown): StructureResult {
  const error = preflightGlyf(value);
  if (error) return { ok: false, problem: error };
  if (!matchesSchema(value)) return { ok: false, problem: matchesSchema.errors! };
  return { ok: true, document: value };
}
