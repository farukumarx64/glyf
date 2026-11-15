import type { ParseResult } from './errors.ts';
import { parseMosaicText } from './source.ts';
import { validateMosaic } from './validate.ts';

export {
  checkMosaicHeader,
  parseMosaicBytes,
  parseMosaicText,
  type SourceResult,
} from './source.ts';

/** Read a JSON source string and validate it against the full v0.1 contract. */
export function parseMosaic(text: string): ParseResult {
  const source = parseMosaicText(text);
  return source.ok ? validateMosaic(source.value) : source;
}
