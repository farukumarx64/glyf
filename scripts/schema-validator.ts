import type { ErrorObject } from 'ajv';
import { checkStructure } from '../src/core/schema.ts';

// Keep the boolean and Ajv diagnostic interface used by the conformance tools.
export function validateSchema(value: unknown): boolean {
  const problem = checkStructure(value);
  if (!problem) {
    validateSchema.errors = null;
    return true;
  }
  validateSchema.errors = Array.isArray(problem)
    ? problem
    : [
        {
          keyword: 'preflight',
          instancePath: problem.path,
          schemaPath: '',
          params: { code: problem.code },
          message: problem.message,
        },
      ];
  return false;
}
validateSchema.errors = null as ErrorObject[] | null;
