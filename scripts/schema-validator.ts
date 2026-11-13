import { Ajv2020 } from 'ajv/dist/2020.js';
import schema from '../schema/mosaic-v0.1.schema.json' with { type: 'json' };

// Tooling only: this checks structure, not full Mosaic validity. Phase 1 adds
// resource preflight and semantic validation before untrusted documents reach UI.
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
export const validateSchema = ajv.compile<unknown>(schema);
