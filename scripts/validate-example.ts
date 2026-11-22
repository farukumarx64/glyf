import { openAsBlob } from 'node:fs';
import { readGlyfFile } from '../src/core/file.ts';
import { validateGlyf } from '../src/core/validate.ts';

try {
  const name = 'glyf-demo.glyf';
  const file = await openAsBlob(new URL('../examples/' + name, import.meta.url));
  const source = await readGlyfFile(file);
  const result = source.ok ? validateGlyf(source.value) : source;
  if (!result.ok) {
    console.error(name, JSON.stringify(result.errors, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`${name} passes resource preflight, schema, and semantic validation.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not validate the reference demo.');
  process.exitCode = 1;
}
