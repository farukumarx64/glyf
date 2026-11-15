import type { MosaicError } from './errors.ts';
import { ROOT_POINTER } from './json-pointer.ts';
import { MOSAIC_LIMITS } from './limits.ts';

export function textSizeError(): MosaicError {
  return {
    code: 'FILE_TOO_LARGE',
    path: ROOT_POINTER,
    message: `Document text exceeds the limit of ${MOSAIC_LIMITS.fileBytes} UTF-8 bytes.`,
  };
}

// Measure supplied JS strings without allocating an encoded copy. UTF-16 length
// is a lower bound, so an oversized string can be rejected immediately.
export function checkUtf8Text(text: string): MosaicError | undefined {
  const max = MOSAIC_LIMITS.fileBytes;
  let bytes = text.length;
  if (bytes > max) return textSizeError();
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) continue;
    if (unit < 0x800) bytes++;
    else if (unit >= 0xd800 && unit <= 0xdfff) {
      const next = text.charCodeAt(i + 1);
      if (unit > 0xdbff || !(next >= 0xdc00 && next <= 0xdfff)) {
        return {
          code: 'INVALID_UTF8',
          path: ROOT_POINTER,
          message: 'Text contains an unpaired surrogate that cannot be represented in UTF-8.',
        };
      }
      i++;
      bytes += 2; // Already counted both UTF-16 units; this pair takes four bytes.
    } else bytes += 2;
    if (bytes > max) return textSizeError();
  }
  return undefined;
}
