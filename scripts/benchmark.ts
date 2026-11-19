import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium, type CDPSession, type Page } from '@playwright/test';
import { build, preview } from 'vite';
import ts from 'typescript';
import { baselineSource, fixtureProfiles, generateFixture } from './benchmarks/fixtures.ts';
import { memorySlope, summarize } from './benchmarks/statistics.ts';
import type {} from './benchmarks/viewer.ts';
import type {} from './benchmarks/harness.tsx';

const samples = 20;
const warmups = 3;
const cycles = 100;
const memorySamples = 10;
const output = path.resolve('benchmark-results');
const fixtures = fixtureProfiles.map(generateFixture);
await mkdir(path.join(output, 'fixtures'), { recursive: true });
for (const fixture of fixtures) {
  await writeFile(path.join(output, 'fixtures', `${fixture.name}.mosa`), fixture.source);
}

async function bundleSizes() {
  const assets = [];
  for (const name of (await readdir('dist/assets')).sort()) {
    const bytes = await readFile(path.join('dist/assets', name));
    assets.push({
      name,
      bytes: bytes.length,
      gzipBytes: gzipSync(bytes, { level: 6 }).length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  return {
    assets,
    gzipLevel: 6,
    // Conservatively count every emitted JS chunk, including any future lazy chunks.
    javascriptGzipBytes: assets
      .filter((item) => item.name.endsWith('.js'))
      .reduce((sum, item) => sum + item.gzipBytes, 0),
    exampleBytes: (await readFile('examples/mosaic-demo.mosa')).length,
  };
}

function summarizeRows<T extends Record<string, number>>(rows: T[]) {
  return Object.fromEntries(
    Object.keys(rows[0]!).map((key) => [key, summarize(rows.map((row) => row[key]!))]),
  );
}

async function heap(page: Page, cdp: CDPSession, collect: boolean) {
  if (collect) {
    await page.evaluate(() => window.mosaicViewerBench.settle());
    await cdp.send('HeapProfiler.collectGarbage');
  }
  const usage = await cdp.send('Runtime.getHeapUsage');
  const dom = await cdp.send('Memory.getDOMCounters');
  const visible = await page.evaluate(() => window.mosaicViewerBench.counts());
  return { ...usage, ...dom, ...visible };
}

console.log('Building isolated production measurement harness (excluded from dist/).');
await build({
  configFile: path.resolve('vite.config.ts'),
  root: path.resolve('scripts/benchmarks'),
  build: { outDir: path.join(output, 'harness'), emptyOutDir: true },
});
const appServer = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true } });
let harnessServer: Awaited<ReturnType<typeof preview>> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  harnessServer = await preview({
    configFile: false,
    build: { outDir: path.join(output, 'harness') },
    preview: { host: '127.0.0.1', port: 4176, strictPort: true },
  });
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme: 'light',
  });
  const app = await context.newPage();
  const harness = await context.newPage();
  const errors: string[] = [];
  const requests: string[] = [];
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  for (const page of [app, harness]) page.on('pageerror', (error) => errors.push(error.message));
  await app.goto('http://127.0.0.1:4175');
  await app.getByRole('button', { name: 'Open Demo' }).waitFor();
  await harness.goto('http://127.0.0.1:4176');
  await harness.waitForFunction(() => typeof window.mosaicCoreBench === 'function');
  // Compile the browser-only observer without tsx's Node-side function-name helpers.
  const observerSource = await readFile('scripts/benchmarks/viewer.ts', 'utf8');
  await app.addScriptTag({
    type: 'module',
    content: ts.transpileModule(observerSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText,
  });
  await app.waitForFunction(() => typeof window.installMosaicViewerBenchmark === 'function');
  await app.evaluate(
    (sources) => window.installMosaicViewerBenchmark(sources),
    [
      { name: 'baseline', source: baselineSource },
      ...fixtures.map(({ name, source }) => ({ name, source })),
    ],
  );
  // All measured local-document work runs offline, after both production bundles load.
  context.on('request', (request) => requests.push(request.url()));
  await context.setOffline(true);
  app.on('dialog', (dialog) => void dialog.accept());
  const cdp = await context.newCDPSession(app);
  await cdp.send('HeapProfiler.enable');
  const timingResults = [];

  for (const fixture of fixtures) {
    console.log(`Measuring ${fixture.name}: ${fixture.bytes} bytes, ${fixture.nodes} nodes.`);
    const core = [];
    const opened = [];
    const edits = [];
    const progressive = [];
    await harness.bringToFront();
    for (let i = 0; i < warmups + samples; i++) {
      const result = await harness.evaluate(
        (source) => window.mosaicCoreBench(source),
        fixture.source,
      );
      if (i >= warmups) core.push(result);
    }
    await app.bringToFront();
    await app.evaluate(() => window.mosaicViewerBench.open('baseline'));
    for (let i = 0; i < warmups + samples; i++) {
      const result = await app.evaluate(
        (name) => window.mosaicViewerBench.open(name),
        fixture.name,
      );
      const counts = await app.evaluate(() => window.mosaicViewerBench.counts());
      assert.equal(counts.tableRows, fixture.initiallyVisibleRows);
      assert.equal(counts.barPoints, fixture.pointsPerChart);
      assert.equal(counts.linePoints, fixture.pointsPerChart);
      if (i >= warmups) opened.push(result);
      if (fixture.rows > 100) {
        const next = await app.evaluate(() => window.mosaicViewerBench.nextRows());
        if (i >= warmups) progressive.push(next);
      }
    }
    // Chart updates use the normal initial 100-row table, not the expanded one.
    await app.evaluate((name) => window.mosaicViewerBench.open(name), fixture.name);
    for (let i = 0; i < warmups + samples; i++) {
      const result = await app.evaluate((value) => window.mosaicViewerBench.edit(value), 1000 + i);
      if (i >= warmups) edits.push(result);
    }
    // Discard the measured edits before beginning clean replacement/memory loops.
    await app.evaluate(() => window.mosaicViewerBench.open('baseline'));
    timingResults.push({
      name: fixture.name,
      core: summarizeRows(core),
      open: summarizeRows(opened),
      chartUpdate: summarizeRows(edits),
      next100Rows: progressive.length ? summarizeRows(progressive) : null,
    });
  }
  // Remove the separate React root and its documents from the memory experiment entirely.
  await harness.close();
  const memoryResults = [];
  for (const fixture of fixtures) {
    console.log(`Measuring ${memorySamples} baseline/loaded heap pairs for ${fixture.name}.`);
    const snapshots = [];
    for (let i = 0; i < memorySamples; i++) {
      await app.evaluate(() => window.mosaicViewerBench.open('baseline'));
      const baseline = await heap(app, cdp, true);
      await app.evaluate((name) => window.mosaicViewerBench.open(name), fixture.name);
      const liveBeforeGC = await heap(app, cdp, false);
      const liveAfterGC = await heap(app, cdp, true);
      assert.equal(liveAfterGC.tableRows, fixture.initiallyVisibleRows);
      snapshots.push({ baseline, liveBeforeGC, liveAfterGC });
    }
    memoryResults.push({
      name: fixture.name,
      baselineUsedSize: summarize(snapshots.map((item) => item.baseline.usedSize)),
      liveBeforeGCUsedSize: summarize(snapshots.map((item) => item.liveBeforeGC.usedSize)),
      liveAfterGCUsedSize: summarize(snapshots.map((item) => item.liveAfterGC.usedSize)),
      liveAfterGCEmbedderSize: summarize(
        snapshots.map((item) => item.liveAfterGC.embedderHeapUsedSize ?? 0),
      ),
      snapshots,
    });
  }
  await app.evaluate(() => window.mosaicViewerBench.open('baseline'));
  const replacementResults = [];
  for (const fixture of fixtures) {
    console.log(
      `Measuring 100 ${fixture.name} open → baseline replacement cycles with GC checkpoints.`,
    );
    for (let i = 0; i < warmups; i++) {
      await app.evaluate((name) => window.mosaicViewerBench.open(name), fixture.name);
      await app.evaluate(() => window.mosaicViewerBench.open('baseline'));
    }
    const checkpoints = [{ cycle: 0, ...(await heap(app, cdp, true)) }];
    const open = [];
    const reset = [];
    for (let cycle = 1; cycle <= cycles; cycle++) {
      open.push(await app.evaluate((name) => window.mosaicViewerBench.open(name), fixture.name));
      reset.push(await app.evaluate(() => window.mosaicViewerBench.open('baseline')));
      if (cycle % 10 === 0) {
        checkpoints.push({ cycle, ...(await heap(app, cdp, true)) });
        if (cycle % 50 === 0) console.log(`  ${fixture.name}: ${cycle}/100 cycles complete.`);
      }
    }
    replacementResults.push({
      name: fixture.name,
      cycles,
      open: summarizeRows(open),
      reset: summarizeRows(reset),
      checkpoints,
      usedHeapChangeBytes: checkpoints.at(-1)!.usedSize - checkpoints[0]!.usedSize,
      bytesPerCycle: memorySlope(checkpoints),
      lateBytesPerCycle: memorySlope(checkpoints.filter((item) => item.cycle >= 50)),
    });
  }
  // Same page.evaluate/settling/GC cadence without replacing any document.
  console.log('Measuring 100 idle control cycles for memory interpretation.');
  const controlCheckpoints = [{ cycle: 0, ...(await heap(app, cdp, true)) }];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    await app.evaluate(() => window.mosaicViewerBench.settle());
    await app.evaluate(() => window.mosaicViewerBench.settle());
    if (cycle % 10 === 0) controlCheckpoints.push({ cycle, ...(await heap(app, cdp, true)) });
  }
  const idleControl = {
    checkpoints: controlCheckpoints,
    usedHeapChangeBytes: controlCheckpoints.at(-1)!.usedSize - controlCheckpoints[0]!.usedSize,
    bytesPerCycle: memorySlope(controlCheckpoints),
    lateBytesPerCycle: memorySlope(controlCheckpoints.filter((item) => item.cycle >= 50)),
  };
  assert.deepEqual(requests, [], 'Opening local documents must not cause network requests.');
  assert.deepEqual(errors, [], 'Benchmarks must not hide runtime errors.');
  const bundle = await bundleSizes();
  const environment = {
    recordedAtUTC: new Date().toISOString(),
    gitRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
    cpu: os.cpus()[0]?.model,
    logicalCpus: os.cpus().length,
    ramBytes: os.totalmem(),
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    node: process.version,
    browser: `Playwright Chromium ${browser.version()}`,
    headless: true,
    viewport: { width: 1280, height: 800 },
    build: 'Vite production, React production, no StrictMode development double render',
    throttling: 'none; serial workloads; warm application assets; offline document operations',
    samples,
    warmups,
    cyclesPerFixture: cycles,
    memorySamplesPerFixture: memorySamples,
    lockfileSha256: createHash('sha256')
      .update(await readFile('package-lock.json'))
      .digest('hex'),
    percentiles: 'median averages middle pair; p95 uses nearest rank ceil(0.95 × n)',
  };
  const report = {
    environment,
    fixtures: fixtures.map(({ source, ...metadata }) => ({
      ...metadata,
      sha256: createHash('sha256').update(source).digest('hex'),
    })),
    bundle,
    timingResults,
    memoryResults,
    replacementResults,
    idleControl,
    budgets: [
      {
        metric: 'large read/decode/parse/validate median ms',
        measured: timingResults[2]!.core.loadMs!.median,
        maximum: 200,
      },
      {
        metric: 'medium validated-to-rendered median ms',
        measured: timingResults[1]!.core.validatedToRenderedMs!.median,
        maximum: 500,
      },
      {
        metric: 'slowest fixture chart-update median ms',
        measured: Math.max(...timingResults.map((item) => item.chartUpdate.paintMs!.median)),
        maximum: 100,
      },
      {
        metric: 'all emitted JavaScript gzip bytes',
        measured: bundle.javascriptGzipBytes,
        maximum: 250 * 1024,
      },
    ].map((item) => ({ ...item, met: item.measured <= item.maximum })),
    memoryAssessment: 'Inspect checkpoint series and idle control; no automatic leak-free claim.',
    requests,
    errors,
  };
  await writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    'Completed. Raw samples, heap checkpoints, fixture hashes, and bundle sizes: benchmark-results/results.json',
  );
  console.table(
    timingResults.map((item) => ({
      fixture: item.name,
      loadMedianMs: item.core.loadMs!.median,
      renderMedianMs: item.core.validatedToRenderedMs!.median,
      openMedianMs: item.open.paintMs!.median,
      chartMedianMs: item.chartUpdate.paintMs!.median,
    })),
  );
} finally {
  await browser?.close();
  await new Promise<void>((resolve, reject) =>
    appServer.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
  if (harnessServer)
    await new Promise<void>((resolve, reject) =>
      harnessServer!.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
}
