import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
import type { MosaicError } from './errors.ts';
import type { MosaicDocument, MosaicNode } from './types.ts';
import { preflightMosaic } from './preflight.ts';
import schema from '../../schema/mosaic-v0.1.schema.json' with { type: 'json' };

const ajv = new Ajv2020({
  strict: true,
  allowUnionTypes: true, // The contract explicitly permits scalar type unions.
  strictNumbers: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  allErrors: false,
  ownProperties: true,
});

// The schema accepts any known node at the root. The semantic stage narrows it.
export type StructuralDocument = Omit<MosaicDocument, 'root'> & { readonly root: MosaicNode };
const matchesSchema = ajv.compile<StructuralDocument>(schema);

type StructureResult =
  { ok: true; document: StructuralDocument } | { ok: false; problem: MosaicError | ErrorObject[] };

/** Internal shared boundary for the core API and the schema conformance tools. */
export function checkStructure(value: unknown): StructureResult {
  const error = preflightMosaic(value);
  if (error) return { ok: false, problem: error };
  if (!matchesSchema(value)) return { ok: false, problem: matchesSchema.errors! };
  return { ok: true, document: value };
}
