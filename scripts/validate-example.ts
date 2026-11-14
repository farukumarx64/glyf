import { openAsBlob } from 'node:fs';
import { readMosaicFile } from '../src/core/file.ts';
import { validateSchema } from './schema-validator.ts';

try {
  const file = await openAsBlob(new URL('../examples/mosaic-demo.mosa', import.meta.url));
  const result = await readMosaicFile(file);
  if (!result.ok) {
    console.error(JSON.stringify(result.errors, null, 2));
    process.exitCode = 1;
  } else if (!validateSchema(result.value)) {
    console.error('Reference demo failed JSON Schema validation:');
    console.error(JSON.stringify(validateSchema.errors, null, 2));
    process.exitCode = 1;
  } else {
    console.log('mosaic-demo.mosa passes Draft 2020-12 schema validation.');
    console.log('Semantic validation is scheduled for Phase 1.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not validate the reference demo.');
  process.exitCode = 1;
}
