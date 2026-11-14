import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject } from 'ajv';
import type { MosaicError } from './errors.ts';
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

// Compile the trusted local schema once per module instance. Do not load schemas
// from a document or give this structural check a semantic type predicate.
const matchesSchema = ajv.compile<unknown>(schema);

/** Internal shared boundary for the core API and the schema conformance tools. */
export function checkStructure(value: unknown): MosaicError | ErrorObject[] | undefined {
  const error = preflightMosaic(value);
  if (error) return error;
  if (!matchesSchema(value)) return matchesSchema.errors!;
}
