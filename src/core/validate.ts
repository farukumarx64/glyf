import type { MosaicErrors } from './errors.ts';
import { appendJsonPointer, isJsonPointer, ROOT_POINTER } from './json-pointer.ts';
import { checkMosaicHeader } from './parse.ts';
import { checkStructure } from './schema.ts';

type StructureResult =
  { readonly ok: true } | { readonly ok: false; readonly errors: MosaicErrors };

/** Current validation stages: resource preflight and the v0.1 structural schema. */
export function validateMosaic(value: unknown): StructureResult {
  const problem = checkStructure(value);
  if (!problem) return { ok: true };
  if (!Array.isArray(problem)) return { ok: false, errors: [problem] };

  const headerError = checkMosaicHeader(value);
  if (headerError) return { ok: false, errors: [headerError] };
  // All array and property-count maxima in v0.1 are published resource limits.
  // Other string-length rules (for example, a heading) are structural.
  const budget = problem.find(
    (error) =>
      error.keyword === 'maxItems' ||
      error.keyword === 'maxProperties' ||
      error.schemaPath === '#/$defs/markdown/properties/text/maxLength',
  );
  // oneOf failures also contain diagnostics from inapplicable node types.
  const issue = budget ?? problem.find((error) => error.keyword === 'oneOf') ?? problem[0]!;
  let path = isJsonPointer(issue.instancePath) ? issue.instancePath : ROOT_POINTER;
  if (issue.keyword === 'required') path = appendJsonPointer(path, issue.params.missingProperty);
  if (issue.keyword === 'additionalProperties')
    path = appendJsonPointer(path, issue.params.additionalProperty);
  return {
    ok: false,
    errors: [
      {
        code: budget ? 'RESOURCE_LIMIT' : 'SCHEMA_ERROR',
        path,
        message: issue.message ?? 'Value does not match the Mosaic schema.',
      },
    ],
  };
}
