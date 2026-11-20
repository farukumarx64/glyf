import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, webkit, type CDPSession } from '@playwright/test';
import { preview } from 'vite';
import ts from 'typescript';
import { baselineSource, fixtureProfiles, generateFixture } from './benchmarks/fixtures.ts';
import { summarizeHeap, type HeapSnapshot } from './benchmarks/profile-summary.ts';
import { processTreeMemory } from './benchmarks/process-memory.ts';
import { memorySlope } from './benchmarks/statistics.ts';
import type {} from './benchmarks/viewer.ts';
import type {} from './benchmarks/memory-observer.ts';

const [label = 'latest', engine = 'chromium', count = '1000', executablePath] =
  process.argv.slice(2);
const cycles = Number(count);
if (
  !/^[a-z0-9-]+$/.test(label) ||
  !['chromium', 'webkit'].includes(engine) ||
  !Number.isInteger(cycles) ||
  cycles < 100 ||
  cycles > 5000 ||
  cycles % 100 ||
  (executablePath && engine !== 'chromium') ||
  !['darwin', 'linux'].includes(process.platform)
) {
  throw new Error(
    'Usage (macOS/Linux): npm run memory -- <label> <chromium|webkit> <100..5000, by 100> [Chromium executable]',
  );
}
const output = path.resolve('benchmark-results', `memory-${label}`);
await mkdir(path.dirname(output), { recursive: true });
// Require a new label to preserve evidence from earlier runs.
await mkdir(output);
const fixtures = fixtureProfiles.map(generateFixture);
const sources = [{ name: 'baseline', source: baselineSource }, ...fixtures];
const observerSources = await Promise.all(
  ['viewer', 'memory-observer'].map(
    async (name) =>
      ts.transpileModule(await readFile(`scripts/benchmarks/${name}.ts`, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
      }).outputText,
  ),
);
const assets = await Promise.all(
  (await readdir('dist/assets')).sort().map(async (name) => ({
    name,
    sha256: createHash('sha256')
      .update(await readFile(`dist/assets/${name}`))
      .digest('hex'),
  })),
);
const environment = {
  recordedAtUTC: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim(),
  platform: process.platform,
  release: os.release(),
  architecture: process.arch,
  cpu: os.cpus()[0]?.model,
  ramBytes: os.totalmem(),
  node: process.version,
  engine,
  executablePath: executablePath ?? null,
  assets,
  lockfileSha256: createHash('sha256')
    .update(await readFile('package-lock.json'))
    .digest('hex'),
  cycles,
  warmups: 10,
  viewport: { width: 1280, height: 800 },
  fixtures: fixtures.map(({ name, source, ...metadata }) => ({
    name,
    ...metadata,
    sha256: createHash('sha256').update(source).digest('hex'),
  })),
};
await writeFile(path.join(output, 'environment.json'), JSON.stringify(environment, null, 2) + '\n');
const server = await preview({ preview: { host: '127.0.0.1', port: 4178, strictPort: true } });
try {
  for (const workload of ['idle', 'small', 'large'] as const) {
    const browserType = engine === 'chromium' ? chromium : webkit;
    const browserServer = await browserType.launchServer({
      ...(executablePath ? { executablePath } : {}),
    });
    try {
      const browser = await browserType.connect(browserServer.wsEndpoint());
      const context = await browser.newContext({
        viewport: environment.viewport,
        colorScheme: 'light',
      });
      const page = await context.newPage();
      const errors: string[] = [];
      const requests: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('dialog', (dialog) => void dialog.dismiss());
      await page.goto('http://127.0.0.1:4178');
      await page.getByRole('button', { name: 'Open Demo' }).waitFor();
      for (const content of observerSources) await page.addScriptTag({ type: 'module', content });
      await page.waitForFunction(() => !!window.installMosaicMemoryObserver);
      await page.evaluate((values) => window.installMosaicViewerBenchmark(values), sources);
      await page.evaluate(
        (ids) => window.installMosaicMemoryObserver(ids),
        fixtures.map((fixture) => (JSON.parse(fixture.source) as { id: string }).id),
      );
      context.on('request', (request) => requests.push(request.url()));
      await context.setOffline(true);
      const cdp = engine === 'chromium' ? await context.newCDPSession(page) : undefined;
      if (cdp) await cdp.send('HeapProfiler.enable');
      const directory = path.join(output, workload);
      await mkdir(directory);

      async function cycle() {
        if (workload === 'idle') {
          await page.evaluate(() => window.mosaicViewerBench.settle());
          await page.evaluate(() => window.mosaicViewerBench.settle());
        } else {
          await page.evaluate((name) => window.mosaicViewerBench.open(name), workload);
          await page.evaluate(() => window.mosaicMemoryObserver.captureView());
          await page.evaluate(() => window.mosaicViewerBench.open('baseline'));
        }
      }
      await page.evaluate(() => window.mosaicViewerBench.open('baseline'));
      for (let i = 0; i < environment.warmups; i++) await cycle();
      const baselineElements = await page.evaluate(
        () => window.mosaicViewerBench.counts().elements,
      );
      async function checkpoint(cycle: number) {
        await page.evaluate(() => window.mosaicViewerBench.settle());
        await page.requestGC();
        const visible = await page.evaluate(() => window.mosaicViewerBench.counts());
        assert.equal(visible.elements, baselineElements);
        assert.equal(visible.tableRows + visible.barPoints + visible.linePoints, 0);
        const weak = await page.evaluate(() => window.mosaicMemoryObserver.counts());
        const usage = cdp ? await cdp.send('Runtime.getHeapUsage') : null;
        const dom = cdp ? await cdp.send('Memory.getDOMCounters') : null;
        const rss = processTreeMemory(
          execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,comm='], { encoding: 'utf8' }),
          browserServer.process().pid!,
        );
        const heap =
          cdp && [0, cycles / 2, cycles].includes(cycle)
            ? await nativeSnapshot(cdp, path.join(directory, `${cycle}.heapsnapshot`))
            : null;
        console.log(
          `${label}/${workload} ${cycle}/${cycles}: JS ${usage?.usedSize ?? 'unavailable'}, RSS ${rss.rssBytes}, live documents/views ${weak.liveDocuments}/${weak.liveViews}`,
        );
        return { cycle, visible, weak, usage, dom, rss, heap };
      }
      const checkpoints = [await checkpoint(0)];
      for (let i = 1; i <= cycles; i++) {
        await cycle();
        if (i % 100 === 0 || i === cycles / 2) checkpoints.push(await checkpoint(i));
      }
      const first = checkpoints[0]!;
      const last = checkpoints.at(-1)!;
      assert.equal(
        last.weak.documentsSeen - first.weak.documentsSeen,
        workload === 'idle' ? 0 : cycles,
      );
      assert.equal(last.weak.viewsSeen - first.weak.viewsSeen, workload === 'idle' ? 0 : cycles);
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, []);
      const late = checkpoints.filter((entry) => entry.cycle >= cycles / 2);
      const result = {
        browserVersion: browser.version(),
        workload,
        cycles,
        checkpoints,
        lateJsBytesPerCycle: cdp
          ? memorySlope(
              late.map((entry) => ({ cycle: entry.cycle, usedSize: entry.usage!.usedSize })),
            )
          : null,
        lateRssBytesPerCycle: memorySlope(
          late.map((entry) => ({ cycle: entry.cycle, usedSize: entry.rss.rssBytes })),
        ),
        errors,
        requests,
      };
      await writeFile(path.join(directory, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
      await browser.close();
    } finally {
      await browserServer.close();
    }
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}

async function nativeSnapshot(cdp: CDPSession, destination: string) {
  const chunks: string[] = [];
  const receive = ({ chunk }: { chunk: string }) => chunks.push(chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', receive);
  try {
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  } finally {
    cdp.off('HeapProfiler.addHeapSnapshotChunk', receive);
  }
  const source = chunks.join('');
  await writeFile(destination, source);
  const groups = summarizeHeap(JSON.parse(source) as HeapSnapshot);
  const totals: Record<string, { count: number; selfBytes: number }> = {};
  for (const [name, values] of groups) {
    const type = name.slice(0, name.indexOf(':'));
    const total = (totals[type] ??= { count: 0, selfBytes: 0 });
    total.count += values.count;
    total.selfBytes += values.selfBytes;
  }
  return {
    totals,
    mediaGroups: Object.fromEntries(
      [...groups].filter(([name]) => name.startsWith('native: blink::MediaQuery')),
    ),
  };
}
