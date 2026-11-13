import { readFileSync } from 'node:fs';
import { validateSchema } from './schema-validator.ts';

try {
  const text = readFileSync(new URL('../examples/mosaic-demo.mosa', import.meta.url), 'utf8');
  const document: unknown = JSON.parse(text);

  if (!validateSchema(document)) {
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
