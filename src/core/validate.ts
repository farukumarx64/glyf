import type { ParseResult } from './errors.ts';
import { appendJsonPointer, isJsonPointer, ROOT_POINTER } from './json-pointer.ts';
import { checkGlyfHeader } from './source.ts';
import { checkStructure } from './schema.ts';
import { validateSemantics } from './semantics.ts';

/** Validate an in-memory document without coercing, copying, or mutating it. */
export function validateGlyf(value: unknown): ParseResult {
  const result = checkStructure(value);
  if (result.ok) return validateSemantics(result.document);
  const { problem } = result;
  if (!Array.isArray(problem)) return { ok: false, errors: [problem] };

  const headerError = checkGlyfHeader(value);
  if (headerError) return { ok: false, errors: [headerError] };
  // All array and property-count maxima in v0.1 are published resource limits.
  // Other string-length rules (for example, a heading) are structural.
  const budget = problem.find(
    (error) =>
      error.keyword === 'maxItems' ||
      error.keyword === 'maxProperties' ||
      error.schemaPath === '#/$defs/markdown/properties/text/maxLength',
  );
  // The innermost failed node union includes mismatched type constants from
  // other branches. Prefer a field failure inside that node when available.
  const union = problem.find((error) => error.keyword === 'oneOf');
  const field =
    union &&
    problem.find(
      (error) =>
        error.keyword !== 'const' && error.instancePath.startsWith(union.instancePath + '/'),
    );
  const issue = budget ?? field ?? union ?? problem[0]!;
  let path = isJsonPointer(issue.instancePath) ? issue.instancePath : ROOT_POINTER;
  if (issue.propertyName !== undefined) path = appendJsonPointer(path, issue.propertyName);
  if (issue.keyword === 'required') path = appendJsonPointer(path, issue.params.missingProperty);
  if (issue.keyword === 'additionalProperties')
    path = appendJsonPointer(path, issue.params.additionalProperty);
  return {
    ok: false,
    errors: [
      {
        code: budget ? 'RESOURCE_LIMIT' : 'SCHEMA_ERROR',
        path,
        message: issue.message ?? 'Value does not match the Glyf schema.',
      },
    ],
  };
}
