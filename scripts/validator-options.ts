import type { Options } from 'ajv';

// Preserve the runtime compiler's validation behavior in the build-time compiler.
export const validatorOptions = {
  strict: true,
  allowUnionTypes: true, // The contract explicitly permits scalar type unions.
  strictNumbers: true,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
  allErrors: false,
  ownProperties: true,
} satisfies Options;
