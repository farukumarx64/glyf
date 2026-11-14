import { openAsBlob } from 'node:fs';
import { readMosaicFile } from '../src/core/file.ts';
import { validateMosaic } from '../src/core/validate.ts';

try {
  const file = await openAsBlob(new URL('../examples/mosaic-demo.mosa', import.meta.url));
  const source = await readMosaicFile(file);
  const result = source.ok ? validateMosaic(source.value) : source;
  if (!result.ok) {
    console.error(JSON.stringify(result.errors, null, 2));
    process.exitCode = 1;
  } else {
    console.log('mosaic-demo.mosa passes resource preflight and Draft 2020-12 schema validation.');
    console.log('Semantic validation is scheduled for Phase 1.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not validate the reference demo.');
  process.exitCode = 1;
}
