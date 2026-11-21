import { semver, version } from 'bun';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

// This runs before dependencies exist. Use only built-ins, and read the actual
// project requirements so the guard cannot drift from package.json.
const { engines, packageManager } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

if (`bun@${version}` !== packageManager || !semver.satisfies(version, engines.bun)) {
  throw new Error(`Use ${packageManager} for this checkout; found bun@${version}.`);
}

let nodeVersion;
try {
  nodeVersion = execFileSync('node', ['--print', 'process.versions.node'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
} catch {
  throw new Error(`Install Node ${engines.node} and make node available on PATH.`);
}

if (!semver.satisfies(nodeVersion, engines.node)) {
  throw new Error(`Use Node ${engines.node}; found ${nodeVersion}. See .nvmrc.`);
}
