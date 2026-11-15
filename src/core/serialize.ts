import type { MosaicErrors } from './errors.ts';
import { MOSAIC_LIMITS } from './limits.ts';
import type { MosaicDocument } from './types.ts';
import { checkUtf8Text, textSizeError } from './utf8.ts';
import { validateMosaic } from './validate.ts';

/** Export has a string success contract. Failures carry the same diagnostics as import. */
export class MosaicSerializationError extends Error {
  constructor(readonly errors: MosaicErrors) {
    const { path, message } = errors[0];
    super(path ? `${path}: ${message}` : message);
    this.name = 'MosaicSerializationError';
  }
}

export function serializeMosaic(document: MosaicDocument): string {
  const result = validateMosaic(document);
  if (!result.ok) throw new MosaicSerializationError(result.errors);

  let stringUnits = 0;
  // A direct caller can reuse one large string in many cells. Each occurrence
  // costs at least its UTF-16 length in output bytes, even before JSON escaping.
  // Returning every value unchanged preserves native two-space JSON formatting.
  const json = JSON.stringify(
    result.document,
    (_key, value: unknown) => {
      if (typeof value === 'string') {
        stringUnits += value.length;
        if (stringUnits > MOSAIC_LIMITS.fileBytes)
          throw new MosaicSerializationError([textSizeError()]);
      }
      return value;
    },
    2,
  );

  const text = json + '\n';
  const error = checkUtf8Text(text);
  if (error) throw new MosaicSerializationError([error]);
  return text;
}
