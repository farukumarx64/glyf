import { ROOT_POINTER } from './json-pointer.ts';
import { checkResourceLimit } from './limits.ts';
import { parseMosaicBytes, type SourceResult } from './source.ts';

/** Accepts browser File and Blob. Operating-system read failures reject the promise. */
export async function readMosaicFile(file: Blob): Promise<SourceResult> {
  const error = checkResourceLimit('fileBytes', file.size, ROOT_POINTER);
  if (error) return { ok: false, errors: [error] };
  return parseMosaicBytes(new Uint8Array(await file.arrayBuffer()));
}
