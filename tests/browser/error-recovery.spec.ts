import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { GlyfErrorCode } from '../../src/core/errors.ts';
import { GLYF_LIMITS } from '../../src/core/limits.ts';
import { parseGlyf } from '../../src/core/parse.ts';
import { parseGlyfBytes } from '../../src/core/source.ts';
import type { GlyfDocument, GlyfNode } from '../../src/core/types.ts';
import { validateGlyf } from '../../src/core/validate.ts';
import { minimalDocument, nodeSamples } from '../fixtures.ts';

type Route = 'picker' | 'drop';
interface Payload {
  name: string;
  mimeType: string;
  buffer: Buffer;
}
interface FailureCase {
  file: Payload;
  code: GlyfErrorCode;
  path: string;
}

function payload(name: string, contents: string | Buffer): Payload {
  return {
    name,
    mimeType: 'application/octet-stream',
    buffer: typeof contents === 'string' ? Buffer.from(contents, 'utf8') : contents,
  };
}

// BOM and multibyte text count toward the real file size. JSON trailing spaces
// make the boundary fixture large without adding a large rendered value.
function boundaryFile(bytes: number): Payload {
  const doc = { ...minimalDocument(), meta: { title: 'Input boundary 雪 😀' } };
  const prefix = Buffer.from('\uFEFF' + JSON.stringify(doc), 'utf8');
  return payload(
    'boundary.glyf',
    Buffer.concat([prefix, Buffer.alloc(bytes - prefix.length, 0x20)]),
  );
}

function failureCases(): FailureCase[] {
  const minimal = minimalDocument();
  const text = (name: string, value: unknown) => payload(name, JSON.stringify(value));
  const fixture = (name: string) =>
    payload(name, readFileSync(new URL('../../examples/invalid/' + name, import.meta.url)));
  let deep: GlyfNode = { ...nodeSamples.divider };
  for (let i = 1; i <= GLYF_LIMITS.treeDepth; i++) {
    deep = { id: 'depth' + i, type: 'card', children: [deep] };
  }
  return [
    { file: payload('empty.glyf', ''), code: 'INVALID_JSON', path: '' },
    {
      file: payload('truncated.glyf', '{"glyf":"0.1.0","root":'),
      code: 'INVALID_JSON',
      path: '',
    },
    { file: payload('comma.glyf', '{"glyf":"0.1.0",}'), code: 'INVALID_JSON', path: '' },
    {
      file: payload(
        'duplicate-property.glyf',
        '{"glyf":"0.1.0","state":{"a/b~":1,"a\\u002fb~":2}}',
      ),
      code: 'INVALID_JSON',
      path: '/state/a~1b~0',
    },
    {
      file: payload('truncated-utf8.glyf', Buffer.from([0xef, 0xbb, 0xbf, 0xe2, 0x82])),
      code: 'INVALID_UTF8',
      path: '',
    },
    {
      file: payload(
        'utf16.glyf',
        Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify(minimal), 'utf16le')]),
      ),
      code: 'INVALID_UTF8',
      path: '',
    },
    {
      file: payload('double-bom.glyf', '\uFEFF\uFEFF' + JSON.stringify(minimal)),
      code: 'INVALID_JSON',
      path: '',
    },
    {
      file: text('future-version.glyf', { ...minimal, glyf: '0.2.0' }),
      code: 'UNSUPPORTED_VERSION',
      path: '/glyf',
    },
    {
      file: text('unknown-field.glyf', { ...minimal, unexpected: true }),
      code: 'SCHEMA_ERROR',
      path: '/unexpected',
    },
    {
      file: text('leaf-root.glyf', { ...minimal, root: nodeSamples.text }),
      code: 'INVALID_ROOT',
      path: '/root/type',
    },
    {
      file: fixture('duplicate-node-id.glyf'),
      code: 'DUPLICATE_ID',
      path: '/root/children/1/children/0/id',
    },
    {
      file: fixture('wrong-column-type.glyf'),
      code: 'INVALID_DATASET',
      path: '/datasets/sales/rows/0/amount',
    },
    {
      file: fixture('missing-binding.glyf'),
      code: 'INVALID_BINDING',
      path: '/root/children/0/children/0/bind',
    },
    {
      file: text('too-many-nodes.glyf', {
        ...minimal,
        root: {
          ...minimal.root,
          children: Array.from({ length: GLYF_LIMITS.nodes }, (_, i) => ({
            ...nodeSamples.divider,
            id: 'n' + i,
          })),
        },
      }),
      code: 'RESOURCE_LIMIT',
      path: '/root/children',
    },
    {
      file: text('too-deep.glyf', { ...minimal, root: deep }),
      code: 'RESOURCE_LIMIT',
      path: '/root' + '/children/0'.repeat(GLYF_LIMITS.treeDepth),
    },
    { file: boundaryFile(GLYF_LIMITS.fileBytes + 1), code: 'FILE_TOO_LARGE', path: '' },
  ];
}

async function importFile(page: Page, route: Route, file: Payload) {
  if (route === 'picker') {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open File' }).click();
    await (await chooser).setFiles(file);
  } else {
    const transfer = await page.evaluateHandle(
      ({ name, mimeType, base64 }) => {
        const data = new DataTransfer();
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        data.items.add(new File([bytes], name, { type: mimeType }));
        return data;
      },
      { name: file.name, mimeType: file.mimeType, base64: file.buffer.toString('base64') },
    );
    try {
      await page.getByRole('main').dispatchEvent('drop', { dataTransfer: transfer });
    } finally {
      await transfer.dispose();
    }
  }
}

async function offlineViewer(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Demo' })).toBeVisible();
  const requests: string[] = [];
  const errors: string[] = [];
  const dialogs: string[] = [];
  page.context().on('request', (request) => {
    if (!request.url().startsWith('blob:')) requests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.context().setOffline(true);
  return { requests, errors, dialogs };
}

function editedDemo(): GlyfDocument {
  const opened = parseGlyf(
    readFileSync(new URL('../../examples/glyf-demo.glyf', import.meta.url), 'utf8'),
  );
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const doc = opened.document;
  const revenue = doc.datasets!.revenue!;
  return {
    ...doc,
    state: { ...doc.state, note: 'Keep 雪 😀\nSecond line', showChart: false },
    datasets: {
      ...doc.datasets,
      revenue: {
        ...revenue,
        rows: revenue.rows.map((row) => (row.id === 'jan' ? { ...row, amount: 5000 } : row)),
      },
    },
  };
}

for (const route of ['picker', 'drop'] as const) {
  for (const view of ['Preview', 'Source'] as const) {
    test(`preserves edited ${view} through rejected ${route} files, exports and retries offline`, async ({
      page,
      browser,
    }, testInfo) => {
      const observed = await offlineViewer(page);
      await page.getByRole('button', { name: 'Open Demo' }).click();
      const expected = editedDemo();
      const expectedText = JSON.stringify(expected, null, 2) + '\n';
      const note = page.getByRole('textbox', { name: 'Document note' });
      const cell = page.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
      await note.fill(String(expected.state!.note));
      await cell.fill('5000');
      await page.getByRole('checkbox', { name: 'Show revenue chart' }).uncheck();
      if (view === 'Source') await page.getByRole('tab', { name: 'Source' }).click();
      else await cell.fill('1e');
      const panel = page.getByRole('tabpanel', { name: view });
      const originalPanel = await panel.elementHandle();
      const originalCell = view === 'Preview' ? await cell.elementHandle() : null;
      const filename = await page.locator('.file-name').textContent();
      const results: {
        name: string;
        bytes: number;
        code: GlyfErrorCode;
        path: string;
        message: string;
      }[] = [];

      for (const { file, code, path } of failureCases()) {
        await test.step(file.name, async () => {
          // Assert classification independently, then verify that the UI preserves
          // the public reader/validator's exact human-readable diagnostic.
          const source = parseGlyfBytes(file.buffer);
          const result = source.ok ? validateGlyf(source.value) : source;
          expect(result).toMatchObject({ ok: false, errors: [{ code, path }] });
          if (result.ok) throw new Error('Expected an invalid recovery fixture');
          const message = result.errors[0].message;
          await importFile(page, route, file);
          const alert = page.getByRole('alert', { name: 'Could not open ' + file.name });
          await expect(alert).toBeFocused();
          await expect(alert.locator('li > p')).toHaveText(message);
          await expect(alert.locator('.diagnostic > code')).toHaveText(code);
          await expect(alert.locator('.diagnostic span code')).toHaveText(path || '""');
          if (!path) await expect(alert).toContainText('(document root)');
          await expect(page.locator('.loading')).toHaveCount(0);
          await expect(page.getByRole('button', { name: 'Download' })).toBeEnabled();
          await expect(page.getByRole('tab', { name: view })).toHaveAttribute(
            'aria-selected',
            'true',
          );
          expect(await panel.evaluate((node, original) => node === original, originalPanel)).toBe(
            true,
          );
          expect(await page.locator('.file-name').textContent()).toBe(filename);
          await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
          for (const [key, value] of Object.entries(expected.theme!))
            await expect(page.locator('.viewer')).toHaveAttribute('data-' + key, value);
          if (view === 'Source') expect(await panel.textContent()).toBe(expectedText);
          else {
            expect(await cell.evaluate((node, original) => node === original, originalCell)).toBe(
              true,
            );
            await expect(cell).toHaveValue('1e');
            await expect(cell).toHaveAttribute('aria-invalid', 'true');
            await expect(note).toHaveValue(String(expected.state!.note));
            await expect(
              page.getByRole('checkbox', { name: 'Show revenue chart' }),
            ).not.toBeChecked();
            await expect(page.getByRole('img', { name: 'Revenue by month' })).toHaveCount(0);
            await expect(
              page.getByText('Current note: ' + expected.state!.note, { exact: true }),
            ).toBeVisible();
          }
          expect(observed.dialogs).toEqual([]);
          results.push({ name: file.name, bytes: file.buffer.length, code, path, message });
        });
      }

      await page.setViewportSize({ width: 320, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
      await page.screenshot({
        path: testInfo.outputPath('preserved-error-320.png'),
        fullPage: true,
      });
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download' }).click();
      const download = await pending;
      expect(download.suggestedFilename()).toBe('glyf-demo.glyf');
      const saved = testInfo.outputPath('preserved-edits.glyf');
      await download.saveAs(saved);
      const bytes = await readFile(saved);
      expect(bytes).toEqual(Buffer.from(expectedText, 'utf8'));
      expect(parseGlyf(bytes.toString('utf8'))).toEqual({ ok: true, document: expected });
      await expect(page.locator('.error-panel')).toHaveCount(0);
      await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
      if (view === 'Preview') await expect(cell).toHaveValue('1e');

      // Correct the last failed filename and retry through the same route.
      await importFile(page, route, payload('boundary.glyf', JSON.stringify(minimalDocument())));
      await expect(page.getByRole('heading', { name: 'Minimal document' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Preview' })).toBeFocused();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page.getByText('boundary.glyf', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Open Demo' }).click();
      await expect(note).toHaveValue('First report');
      await expect(cell).toHaveValue('1200');
      await expect(page.getByRole('checkbox', { name: 'Show revenue chart' })).toBeChecked();
      await expect(page.getByRole('img', { name: 'Revenue by month' })).toBeVisible();
      expect(await page.evaluate(() => navigator.onLine)).toBe(false);
      expect(observed).toEqual({ requests: [], errors: [], dialogs: [] });
      await writeFile(
        testInfo.outputPath('recovery-results.json'),
        JSON.stringify(
          {
            browser: browser.version(),
            route,
            view,
            cases: results,
            exportBytes: bytes.length,
            ...observed,
          },
          null,
          2,
        ) + '\n',
      );
      await originalPanel?.dispose();
      await originalCell?.dispose();
    });
  }

  test(`accepts exactly 5 MiB after rejecting one extra byte through ${route}`, async ({
    page,
  }) => {
    const observed = await offlineViewer(page);
    await page.getByRole('button', { name: 'Open Demo' }).click();
    const over = boundaryFile(GLYF_LIMITS.fileBytes + 1);
    expect(over.buffer.length).toBe(5_242_881);
    await importFile(page, route, over);
    const error = page.getByRole('alert');
    await expect(error).toBeFocused();
    await expect(error).toContainText('FILE_TOO_LARGE');
    await expect(page.getByRole('textbox', { name: 'Document note' })).toHaveValue('First report');
    await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
    const exact = boundaryFile(GLYF_LIMITS.fileBytes);
    expect(exact.buffer.length).toBe(5_242_880);
    await importFile(page, route, exact);
    await expect(page.getByRole('heading', { name: 'Input boundary 雪 😀' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Preview' })).toBeFocused();
    await expect(error).toHaveCount(0);
    await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Source' }).click();
    expect(
      JSON.parse((await page.getByRole('tabpanel', { name: 'Source' }).textContent())!),
    ).toEqual({ ...minimalDocument(), meta: { title: 'Input boundary 雪 😀' } });
    expect(observed).toEqual({ requests: [], errors: [], dialogs: [] });
  });
}
