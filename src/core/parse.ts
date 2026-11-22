import type { ParseResult } from './errors.ts';
import { parseGlyfText } from './source.ts';
import { validateGlyf } from './validate.ts';

export { checkGlyfHeader, parseGlyfBytes, parseGlyfText, type SourceResult } from './source.ts';

/** Read a JSON source string and validate it against the full v0.1 contract. */
export function parseGlyf(text: string): ParseResult {
  const source = parseGlyfText(text);
  return source.ok ? validateGlyf(source.value) : source;
}
