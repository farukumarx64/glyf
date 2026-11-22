import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { SourceMap } from 'node:module';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import ts from 'typescript';
import { baselineSource, fixtureProfiles, generateFixture } from './benchmarks/fixtures.ts';
import {
  compareHeaps,
  summarizeCpu,
  summarizeHeap,
  type CpuProfile,
  type HeapSnapshot,
} from './benchmarks/profile-summary.ts';
import type {} from './benchmarks/viewer.ts';

const label = process.argv[2] ?? 'latest';
const fixture = process.argv[3] ?? 'small';
if (!/^[a-z0-9-]+$/.test(label) || !fixtureProfiles.some((item) => item.name === fixture)) {
  throw new Error('Usage: bun run profile <label: a-z, 0-9, hyphen> <small|medium|large>');
}
const output = path.resolve('benchmark-results', `profile-${label}`);
await mkdir(output, { recursive: true });
// Source maps identify minified frames; they are built only into this ignored directory.
await build({ build: { outDir: path.join(output, 'app'), sourcemap: true } });
const server = await preview({
  build: { outDir: path.join(output, 'app') },
  preview: { host: '127.0.0.1', port: 4177, strictPort: true },
});
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => void dialog.accept());
  await page.goto('http://127.0.0.1:4177');
  await page.getByRole('button', { name: 'Open Demo' }).waitFor();
  await page.addScriptTag({
    type: 'module',
    content: ts.transpileModule(await readFile('scripts/benchmarks/viewer.ts', 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText,
  });
  await page.waitForFunction(() => typeof window.installGlyfViewerBenchmark === 'function');
  await page.evaluate(
    (sources) => window.installGlyfViewerBenchmark(sources),
    [{ name: 'baseline', source: baselineSource }, ...fixtureProfiles.map(generateFixture)],
  );
  context.on('request', (request) => requests.push(request.url()));
  await context.setOffline(true);
  const cdp = await context.newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  let previous: ReturnType<typeof summarizeHeap> | undefined;
  async function snapshot(cycle: number) {
    await page.evaluate(() => window.glyfViewerBench.settle());
    await cdp.send('HeapProfiler.collectGarbage');
    const usage = await cdp.send('Runtime.getHeapUsage');
    const dom = await cdp.send('Memory.getDOMCounters');
    const chunks: string[] = [];
    const receive = ({ chunk }: { chunk: string }) => chunks.push(chunk);
    cdp.on('HeapProfiler.addHeapSnapshotChunk', receive);
    try {
      await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    } finally {
      cdp.off('HeapProfiler.addHeapSnapshotChunk', receive);
    }
    const source = chunks.join('');
    await writeFile(path.join(output, `${cycle}.heapsnapshot`), source);
    const summary = summarizeHeap(JSON.parse(source) as HeapSnapshot);
    const changes = previous ? compareHeaps(previous, summary) : [];
    previous = summary;
    console.log(
      `${fixture}: ${cycle}/500 cycles, JS heap ${usage.usedSize} bytes, ${dom.nodes} DOM nodes.`,
    );
    return { cycle, ...usage, ...dom, changes };
  }
  for (let i = 0; i < 3; i++) {
    await page.evaluate((name) => window.glyfViewerBench.open(name), fixture);
    await page.evaluate(() => window.glyfViewerBench.open('baseline'));
  }
  const checkpoints = [await snapshot(0)];
  for (let cycle = 1; cycle <= 500; cycle++) {
    await page.evaluate((name) => window.glyfViewerBench.open(name), fixture);
    await page.evaluate(() => window.glyfViewerBench.open('baseline'));
    if ([100, 300, 500].includes(cycle)) checkpoints.push(await snapshot(cycle));
  }
  await page.evaluate(() => window.glyfViewerBench.open('large'));
  for (let i = 0; i < 10; i++)
    await page.evaluate((value) => window.glyfViewerBench.edit(value), 1000 + i);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  for (let i = 0; i < 100; i++)
    await page.evaluate((value) => window.glyfViewerBench.edit(value), 1100 + i);
  const { profile } = (await cdp.send('Profiler.stop')) as { profile: CpuProfile };
  await writeFile(path.join(output, 'edits.cpuprofile'), JSON.stringify(profile));
  const jsUrl = await page.locator('script[src]').first().getAttribute('src');
  assert.ok(typeof jsUrl === 'string' && jsUrl.startsWith('/assets/'));
  const sourceMap = new SourceMap(
    JSON.parse(await readFile(path.join(output, 'app', `${jsUrl.slice(1)}.map`), 'utf8')),
  );
  const cpu = summarizeCpu(profile, sourceMap);
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  const result = {
    recordedAtUTC: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    browser: browser.version(),
    fixture,
    cycles: 500,
    editSamples: 100,
    samplingIntervalMicroseconds: 100,
    checkpoints,
    cpu,
    errors,
    requests,
  };
  await writeFile(path.join(output, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
  console.table(cpu.groups);
  console.log(`Heap snapshots, CPU profile and summary: ${output}`);
} finally {
  await browser?.close();
  await new Promise<void>((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
