import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { readGlyfFile } from '../../src/core/file.ts';
import { GLYF_LIMITS } from '../../src/core/limits.ts';
import type { GlyfDocument } from '../../src/core/types.ts';
import { validateGlyf } from '../../src/core/validate.ts';
import { nodeSamples, typedDocument } from '../fixtures.ts';

async function offlineViewers(writer: Page) {
  const reader = await writer.context().newPage();
  const pages = [writer, reader];
  const pageErrors: string[] = [];
  const unexpectedDialogs: string[] = [];
  for (const page of pages) {
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('dialog', async (dialog) => {
      unexpectedDialogs.push(dialog.message());
      await dialog.dismiss();
    });
  }
  // Both viewers load their app assets before the context goes offline.
  await Promise.all(
    pages.map(async (page) => {
      await page.goto('/');
      await expect(page.getByRole('button', { name: 'Open Demo' })).toBeVisible();
      await expect(page.getByRole('tablist')).toHaveCount(0);
    }),
  );
  const networkRequests: string[] = [];
  writer.context().on('request', (request) => {
    // Blob downloads are local browser resources, not network requests.
    if (!request.url().startsWith('blob:')) networkRequests.push(request.url());
  });
  await writer.context().setOffline(true);
  for (const page of pages) expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  return { reader, pages, networkRequests, pageErrors, unexpectedDialogs };
}

async function chooseFile(page: Page, path: string) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open File' }).click();
  await (await chooser).setFiles(path);
  await expect(page.getByRole('tab', { name: 'Preview' })).toBeFocused();
  await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
}

async function expectSource(page: Page, expected: GlyfDocument) {
  await page.getByRole('tab', { name: 'Source' }).click();
  expect(await page.getByRole('tabpanel', { name: 'Source' }).innerText()).toBe(
    JSON.stringify(expected, null, 2) + '\n',
  );
  await page.getByRole('tab', { name: 'Preview' }).click();
}

async function exportFile(page: Page, expected: GlyfDocument, testInfo: TestInfo, name: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = await pending;
  const path = testInfo.outputPath(name);
  await download.saveAs(path);
  expect(await download.failure()).toBeNull();
  await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
  const bytes = await readFile(path);
  expect(bytes).toEqual(Buffer.from(JSON.stringify(expected, null, 2) + '\n', 'utf8'));
  expect(bytes.length).toBeLessThanOrEqual(GLYF_LIMITS.fileBytes);
  const source = await readGlyfFile(new Blob([new Uint8Array(bytes)]));
  expect(source.ok ? validateGlyf(source.value) : source).toEqual({
    ok: true,
    document: expected,
  });
  return { path, name, bytes: bytes.length, suggestedName: download.suggestedFilename() };
}

async function recordResult(
  session: Awaited<ReturnType<typeof offlineViewers>>,
  testInfo: TestInfo,
  exports: Awaited<ReturnType<typeof exportFile>>[],
) {
  const offline = await Promise.all(
    session.pages.map((page) => page.evaluate(() => !navigator.onLine)),
  );
  expect(offline).toEqual([true, true]);
  expect(session.networkRequests).toEqual([]);
  expect(session.pageErrors).toEqual([]);
  expect(session.unexpectedDialogs).toEqual([]);
  await writeFile(
    testInfo.outputPath('workflow-result.json'),
    JSON.stringify(
      {
        browser: testInfo.project.name,
        version: session.reader.context().browser()!.version(),
        offline,
        networkRequests: session.networkRequests,
        pageErrors: session.pageErrors,
        unexpectedDialogs: session.unexpectedDialogs,
        exports: exports.map(({ name, bytes, suggestedName }) => ({ name, bytes, suggestedName })),
      },
      null,
      2,
    ) + '\n',
  );
}

test('persists demo edits and both conditional chart states across independent offline viewers', async ({
  page,
}, testInfo) => {
  const session = await offlineViewers(page);
  const reader = session.reader;
  const originalText = await readFile(
    new URL('../../examples/glyf-demo.glyf', import.meta.url),
    'utf8',
  );
  const original = JSON.parse(originalText) as GlyfDocument;
  const revenue = original.datasets!.revenue!;
  const note = 'Saved <b>雪 😀</b>\nSecond line';
  const expected: GlyfDocument = {
    ...original,
    state: { ...original.state, note, showChart: false },
    datasets: {
      ...original.datasets,
      revenue: {
        ...revenue,
        rows: revenue.rows.map((row) => ({
          ...row,
          amount: row.id === 'jan' ? -125.5 : row.id === 'feb' ? null : 0,
        })),
      },
    },
  };

  await page.getByRole('button', { name: 'Open Demo' }).click();
  const january = page.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
  await january.fill('-125.5');
  await page.getByRole('button', { name: 'Set Revenue (NGN), row feb to no value' }).click();
  await page.getByRole('textbox', { name: 'Revenue (NGN), row mar' }).fill('0');
  await expect(page.getByRole('img', { name: 'Revenue by month' })).toHaveAccessibleDescription(
    /2 points. Values range from -125.5 to 0. 1 row skipped/,
  );
  await page.getByRole('textbox', { name: 'Document note' }).fill(note);
  await expect(page.locator('#glyf-node-noteDisplay')).toHaveText('Current note: ' + note);
  await page.getByRole('checkbox', { name: 'Show revenue chart' }).uncheck();
  await expect(page.getByRole('img', { name: 'Revenue by month' })).toHaveCount(0);
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await january.fill('1e999');
  await expect(january).toHaveAttribute('aria-invalid', 'true');
  const hidden = await exportFile(page, expected, testInfo, 'hidden-chart.glyf');
  expect(hidden.suggestedName).toBe('glyf-demo.glyf');
  await expect(january).toHaveValue('1e999');

  // This reader has never opened a document, so persisted values must come from the file.
  await expect(reader.getByRole('tablist')).toHaveCount(0);
  await chooseFile(reader, hidden.path);
  await expect(reader.getByRole('textbox', { name: 'Document note' })).toHaveValue(note);
  await expect(reader.locator('#glyf-node-noteDisplay')).toHaveText('Current note: ' + note);
  await expect(reader.locator('#glyf-node-noteDisplay b')).toHaveCount(0);
  await expect(reader.getByRole('textbox', { name: 'Revenue (NGN), row jan' })).toHaveValue(
    '-125.5',
  );
  await expect(reader.getByRole('textbox', { name: 'Revenue (NGN), row feb' })).toHaveValue('');
  await expect(reader.getByRole('textbox', { name: 'Revenue (NGN), row feb' })).toHaveAttribute(
    'placeholder',
    'No value',
  );
  await expect(reader.getByRole('textbox', { name: 'Revenue (NGN), row mar' })).toHaveValue('0');
  await expect(reader.getByRole('checkbox', { name: 'Show revenue chart' })).not.toBeChecked();
  await expect(reader.getByRole('img', { name: 'Revenue by month' })).toHaveCount(0);
  await expect(reader.getByRole('alert')).toHaveCount(0);
  await expectSource(reader, expected);

  await reader.getByRole('checkbox', { name: 'Show revenue chart' }).check();
  const chart = reader.getByRole('img', { name: 'Revenue by month' });
  await expect(chart).toHaveAccessibleDescription(
    /2 points. Values range from -125.5 to 0. 1 row skipped/,
  );
  await expect(chart.locator('rect')).toHaveCount(2);
  await expect(reader.getByText('Unsaved changes', { exact: true })).toBeVisible();
  // Each page owns its own store; toggling the reader leaves the writer unchanged.
  await expect(page.getByRole('checkbox', { name: 'Show revenue chart' })).not.toBeChecked();
  const visibleExpected = { ...expected, state: { ...expected.state, showChart: true } };
  const visible = await exportFile(reader, visibleExpected, testInfo, 'visible-chart.glyf');
  await chooseFile(page, visible.path);
  await expect(january).toHaveValue('-125.5');
  await expect(page.getByRole('checkbox', { name: 'Show revenue chart' })).toBeChecked();
  await expect(page.getByRole('img', { name: 'Revenue by month' })).toHaveAccessibleDescription(
    /2 points. Values range from -125.5 to 0. 1 row skipped/,
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expectSource(page, visibleExpected);
  expect(await readFile(new URL('../../examples/glyf-demo.glyf', import.meta.url), 'utf8')).toBe(
    originalText,
  );
  await expect
    .poll(() =>
      page.getByRole('img', { name: 'Revenue by month' }).evaluate((svg) => {
        const viewBoxWidth = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
        return Math.abs(svg.getBoundingClientRect().width - viewBoxWidth);
      }),
    )
    .toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('reopened-demo.png'), fullPage: true });
  await recordResult(session, testInfo, [hidden, visible]);
});

test('persists typed cells and numeric state while excluding invalid drafts offline', async ({
  page,
}, testInfo) => {
  const session = await offlineViewers(page);
  const reader = session.reader;
  const doc: GlyfDocument = {
    ...typedDocument,
    datasets: {
      values: {
        ...typedDocument.datasets.values,
        columns: typedDocument.datasets.values.columns.map((column) => ({
          ...column,
          editable: true,
        })),
      },
    },
    root: {
      ...typedDocument.root,
      children: [
        nodeSamples.table,
        nodeSamples.input,
        { ...nodeSamples.input, id: 'countInput', kind: 'number', bind: 'count', label: 'Count' },
        { ...nodeSamples.stateValue, bind: 'count', prefix: 'Count: ', suffix: '' },
        {
          ...nodeSamples.when,
          bind: 'count',
          equals: 0,
          children: [{ ...nodeSamples.text, text: 'Zero count' }],
        },
      ],
    },
  };
  await page.getByLabel('Choose a Glyf file').setInputFiles({
    name: 'typed.glyf',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  const literal = 'Second 😀\n<em>literal</em>';
  await page.getByRole('textbox', { name: 'Label, row first' }).fill('');
  await page.getByRole('textbox', { name: 'Label, row second' }).fill(literal);
  await page.getByRole('textbox', { name: 'Amount, row first' }).fill('7.25');
  await page.getByRole('combobox', { name: 'Active, row first' }).selectOption('false');
  await page.getByRole('combobox', { name: 'Active, row second' }).selectOption('');
  await page.getByRole('textbox', { name: 'Note', exact: true }).fill('');
  const count = page.getByRole('textbox', { name: 'Count', exact: true });
  await count.fill('0');
  await expect(page.getByText('Count: 0', { exact: true })).toBeVisible();
  await expect(page.getByText('Zero count', { exact: true })).toBeVisible();
  await count.fill('1e-');
  await expect(count).toHaveAccessibleDescription('Enter a finite decimal number.');
  const expected: GlyfDocument = {
    ...doc,
    state: { ...doc.state, note: '', count: 0 },
    datasets: {
      values: {
        ...doc.datasets!.values!,
        rows: [
          { id: 'first', label: '', amount: 7.25, active: false },
          { id: 'second', label: literal, amount: null, active: null },
        ],
      },
    },
  };
  const saved = await exportFile(page, expected, testInfo, 'typed-values.glyf');
  await expect(count).toHaveValue('1e-');
  await chooseFile(reader, saved.path);
  await expect(reader.getByRole('textbox', { name: 'Label, row first' })).toHaveValue('');
  await expect(reader.getByRole('textbox', { name: 'Label, row first' })).not.toHaveAttribute(
    'placeholder',
    'No value',
  );
  await expect(reader.getByRole('textbox', { name: 'Label, row second' })).toHaveValue(literal);
  await expect(reader.getByRole('textbox', { name: 'Amount, row first' })).toHaveValue('7.25');
  await expect(reader.getByRole('textbox', { name: 'Amount, row second' })).toHaveValue('');
  await expect(reader.getByRole('textbox', { name: 'Amount, row second' })).toHaveAttribute(
    'placeholder',
    'No value',
  );
  await expect(reader.getByRole('combobox', { name: 'Active, row first' })).toHaveValue('false');
  await expect(reader.getByRole('combobox', { name: 'Active, row second' })).toHaveValue('');
  await expect(reader.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue('');
  await expect(reader.getByRole('textbox', { name: 'Count', exact: true })).toHaveValue('0');
  await expect(reader.getByText('Count: 0', { exact: true })).toBeVisible();
  await expect(reader.getByText('Zero count', { exact: true })).toBeVisible();
  await expect(reader.getByRole('alert')).toHaveCount(0);
  await expectSource(reader, expected);
  await reader.setViewportSize({ width: 320, height: 900 });
  expect(await reader.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await reader.screenshot({ path: testInfo.outputPath('reopened-typed-320.png'), fullPage: true });
  await recordResult(session, testInfo, [saved]);
});
