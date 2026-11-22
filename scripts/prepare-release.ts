import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checksums,
  fileRecords,
  releaseArchive,
  sha256,
  type ReleaseFile,
} from './release/archive.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name: string) => readFile(path.join(root, name));
const json = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const pkg = JSON.parse((await read('package.json')).toString('utf8')) as {
  version: string;
  packageManager: string;
};
if (!/^0\.1\.0-rc\.[1-9][0-9]*$/.test(pkg.version)) {
  throw new Error('Candidate packaging requires an app version of 0.1.0-rc.N.');
}
const nodeVersion = (await read('.nvmrc')).toString('utf8').trim();
if (process.versions.node !== nodeVersion) {
  throw new Error(
    `Reproducible candidates require Node ${nodeVersion}; found ${process.versions.node}.`,
  );
}
const bun = process.platform === 'win32' ? 'bun.exe' : 'bun';
const bunVersion = execFileSync(bun, ['--version'], { encoding: 'utf8' }).trim();
if (`bun@${bunVersion}` !== pkg.packageManager) throw new Error(`Use ${pkg.packageManager}.`);
if (
  (await readdir(root)).some((name) => name === '.env' || name.startsWith('.env.')) ||
  Object.keys(process.env).some((name) => name.startsWith('VITE_'))
) {
  throw new Error('Candidate builds require no .env files or VITE_* environment overrides.');
}

async function filesIn(directory: string): Promise<ReleaseFile[]> {
  const entries: ReleaseFile[] = [];
  for (const child of (await readdir(path.join(root, directory))).sort()) {
    const name = `${directory}/${child}`;
    if (name === 'src/core/schema-validator.generated.js') continue;
    const stat = await lstat(path.join(root, name));
    if (stat.isDirectory()) entries.push(...(await filesIn(name)));
    else if (stat.isFile()) entries.push({ name, bytes: await read(name) });
    else throw new Error(`Release input must be a regular file or directory: ${name}`);
  }
  return entries;
}

const notesPath = `docs/releases/${pkg.version}.md`;
const explicitInputs = [
  'package.json',
  'bun.lock',
  'bunfig.toml',
  '.nvmrc',
  'tsconfig.json',
  'vite.config.ts',
  'index.html',
  'examples/glyf-demo.glyf',
  'schema/glyf-v0.1.schema.json',
  'docs/release-package.md',
  notesPath,
];
const inputs = [
  ...(await filesIn('src')),
  ...(await filesIn('scripts')),
  ...(await Promise.all(explicitInputs.map(async (name) => ({ name, bytes: await read(name) })))),
];
const sourceRecords = json(fileRecords(inputs));

// Always rebuild; packaging an old dist/ must never masquerade as a new candidate.
execFileSync(bun, ['run', 'build'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'production' },
});
const schema = JSON.parse((await read('schema/glyf-v0.1.schema.json')).toString('utf8'));
const formatVersion: unknown = schema.properties.glyf.const;
if (formatVersion !== '0.1.0') throw new Error('The candidate expects document format 0.1.0.');
const site = (await filesIn('dist')).map(({ name, bytes }) => ({
  name: name.replace(/^dist\//, 'site/'),
  bytes,
}));
if (
  !site.some(({ name }) => name === 'site/index.html') ||
  !site.some(({ name }) => name === 'site/THIRD_PARTY_LICENSES.md')
) {
  throw new Error('Production HTML and bundled dependency notices are required.');
}
const files: ReleaseFile[] = [
  ...site,
  { name: 'README.md', bytes: await read('docs/release-package.md') },
  { name: 'RELEASE-NOTES.md', bytes: await read(notesPath) },
  { name: 'glyf-demo.glyf', bytes: await read('examples/glyf-demo.glyf') },
  { name: 'glyf-v0.1.schema.json', bytes: await read('schema/glyf-v0.1.schema.json') },
  // Ajv's Unicode helper was bundled before Vite saw the app's dependency graph.
  { name: 'AJV-LICENSE.txt', bytes: await read('node_modules/ajv/LICENSE') },
  { name: 'SOURCE-FILES.json', bytes: sourceRecords },
];
const manifest = json({
  appVersion: pkg.version,
  documentFormat: formatVersion,
  documentVersionField: 'glyf',
  documentExtension: '.glyf',
  status: 'local-evaluation-candidate',
  toolchain: { node: nodeVersion, bun: bunVersion },
  sourceSha256: sha256(sourceRecords),
  lockfileSha256: sha256(await read('bun.lock')),
  files: fileRecords(files),
});
files.push({ name: 'manifest.json', bytes: manifest });
files.push({ name: 'SHA256SUMS', bytes: Buffer.from(checksums(files)) });
const base = `glyf-viewer-${pkg.version}`;
const archive = releaseArchive(
  files.map(({ name, bytes }) => ({ name: `${base}/${name}`, bytes })),
);
const artifacts = [
  { name: `${base}.tar.gz`, bytes: archive },
  { name: `${base}.manifest.json`, bytes: manifest },
];
const out = path.join(root, 'release', pkg.version);
await mkdir(out, { recursive: true });
// Only these generated files are replaced; other versions and unrelated files stay intact.
for (const file of [
  ...artifacts,
  { name: 'SHA256SUMS', bytes: Buffer.from(checksums(artifacts)) },
]) {
  const destination = path.join(out, file.name);
  const temporary = destination + '.tmp';
  await writeFile(temporary, file.bytes);
  await rename(temporary, destination);
}
console.log(`Prepared ${base}.tar.gz (${archive.length} bytes)\nSHA-256 ${sha256(archive)}`);
