import { serializeMosaic } from '../core/serialize.ts';
import type { MosaicDocument } from '../core/types.ts';

/** Validate and format before allocating a download URL or triggering browser I/O. */
export function downloadMosaic(snapshot: MosaicDocument, fileName: string): void {
  const text = serializeMosaic(snapshot);
  const blob = new Blob([text], { type: 'application/json' });
  const link = document.createElement('a');
  const name = fileName.split(/[\\/]/u).at(-1) || 'document';
  link.download = name.replace(/(?:\.mosa)?$/iu, '.mosa');
  link.hidden = true;
  const url = URL.createObjectURL(blob);
  try {
    link.href = url;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to consume the URL before releasing the Blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
