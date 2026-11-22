import type { GlyfErrors } from './errors.ts';
import { GLYF_LIMITS } from './limits.ts';
import type { GlyfDocument } from './types.ts';
import { checkUtf8Text, textSizeError } from './utf8.ts';
import { validateGlyf } from './validate.ts';

/** Export has a string success contract. Failures carry the same diagnostics as import. */
export class GlyfSerializationError extends Error {
  constructor(readonly errors: GlyfErrors) {
    const { path, message } = errors[0];
    super(path ? `${path}: ${message}` : message);
    this.name = 'GlyfSerializationError';
  }
}

export function serializeGlyf(document: GlyfDocument): string {
  const result = validateGlyf(document);
  if (!result.ok) throw new GlyfSerializationError(result.errors);

  let stringUnits = 0;
  // A direct caller can reuse one large string in many cells. Each occurrence
  // costs at least its UTF-16 length in output bytes, even before JSON escaping.
  // Returning every value unchanged preserves native two-space JSON formatting.
  const json = JSON.stringify(
    result.document,
    (_key, value: unknown) => {
      if (typeof value === 'string') {
        stringUnits += value.length;
        if (stringUnits > GLYF_LIMITS.fileBytes)
          throw new GlyfSerializationError([textSizeError()]);
      }
      return value;
    },
    2,
  );

  const text = json + '\n';
  const error = checkUtf8Text(text);
  if (error) throw new GlyfSerializationError([error]);
  return text;
}
