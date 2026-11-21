import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { summarizeHeap, type HeapSnapshot } from './benchmarks/profile-summary.ts';

const [label = 'latest', count = '100', executablePath] = process.argv.slice(2);
const cycles = Number(count);
if (!/^[a-z0-9-]+$/.test(label) || !Number.isInteger(cycles) || cycles < 100 || cycles > 5000) {
  throw new Error('Usage: bun run memory:native <label> <100..5000> [Chromium executable]');
}
const output = path.resolve('benchmark-results', `memory-native-${label}`);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
const results = [];
// No Mosaic, React, author CSS or event handlers: isolate native HTML rendering.
for (const kind of ['div', 'table', 'table-caption'] as const) {
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.setOffline(true);
    const page = await context.newPage();
    const errors: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    context.on('request', (request) => requests.push(request.url()));
    await page.setContent('<!doctype html><html><body><main id="root"></main></body></html>');
    const cdp = await context.newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    async function snapshot(stage: string) {
      await page.requestGC();
      const chunks: string[] = [];
      const receive = ({ chunk }: { chunk: string }) => chunks.push(chunk);
      cdp.on('HeapProfiler.addHeapSnapshotChunk', receive);
      try {
        await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
      } finally {
        cdp.off('HeapProfiler.addHeapSnapshotChunk', receive);
      }
      const source = chunks.join('');
      await writeFile(path.join(output, `${kind}-${stage}.heapsnapshot`), source);
      const groups = summarizeHeap(JSON.parse(source) as HeapSnapshot);
      return {
        mediaGroups: Object.fromEntries(
          [...groups].filter(([name]) => name.startsWith('native: blink::MediaQuery')),
        ),
        dom: await cdp.send('Memory.getDOMCounters'),
      };
    }
    const before = await snapshot('before');
    await page.evaluate(
      async ({ kind, cycles }) => {
        const root = document.querySelector('#root')!;
        for (let i = 0; i < cycles; i++) {
          const element = document.createElement(kind === 'div' ? 'div' : 'table');
          if (kind === 'div') element.textContent = 'Value';
          else {
            element.innerHTML =
              (kind === 'table-caption' ? '<caption>Values</caption>' : '') +
              '<thead><tr><th scope="col">Label</th></tr></thead><tbody><tr><td>Value</td></tr></tbody>';
          }
          root.replaceChildren(element);
          element.getBoundingClientRect();
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          root.replaceChildren();
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }
      },
      { kind, cycles },
    );
    const after = await snapshot('after');
    assert.equal(await page.locator('#root > *').count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    const result = {
      kind,
      browserVersion: browser.version(),
      cycles,
      before,
      after,
      errors,
      requests,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  } finally {
    await browser.close();
  }
}
await writeFile(
  path.join(output, 'summary.json'),
  JSON.stringify({ executablePath: executablePath ?? null, results }, null, 2) + '\n',
);
