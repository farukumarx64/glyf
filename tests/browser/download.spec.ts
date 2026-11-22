import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { GLYF_LIMITS } from '../../src/core/limits.ts';
import { parseGlyf } from '../../src/core/parse.ts';
import type { GlyfDocument } from '../../src/core/types.ts';
import { minimalDocument, nodeSamples } from '../fixtures.ts';

test('rejects pre-rename files offline and reopens a valid Glyf download', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page).toHaveTitle('Glyf');
  await expect(
    page.getByRole('heading', { name: 'One format. Infinite expressions.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: testInfo.outputPath('glyf-start-320.png'), fullPage: true });
  const picker = page.getByLabel('Choose a Glyf file');
  await expect(picker).toHaveAttribute('accept', '.glyf');
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Open Demo' }).click();
  const note = page.getByRole('textbox', { name: 'Document note' });
  await note.fill('Preserved after a rejected old document');
  const legacyText = await readFile(
    new URL('../../docs/reference/mosaic-demo.mosa', import.meta.url),
    'utf8',
  );
  for (const name of ['old.mosa', 'renamed.glyf']) {
    await picker.setInputFiles({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from(legacyText),
    });
    const error = page.getByRole('alert');
    await expect(error).toBeFocused();
    await expect(error).toContainText('SCHEMA_ERROR');
    await expect(error).toContainText('/glyf');
    await expect(page.getByRole('heading', { name: 'Glyf Demo', exact: true })).toBeVisible();
    await expect(note).toHaveValue('Preserved after a rejected old document');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  }
  await page.getByRole('tab', { name: 'Source' }).click();
  const expected = await page.getByRole('tabpanel', { name: 'Source' }).innerText();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('glyf-demo.glyf');
  const file = testInfo.outputPath('saved.glyf');
  await download.saveAs(file);
  expect(await download.failure()).toBeNull();
  const text = await readFile(file, 'utf8');
  expect(text).toBe(expected);
  expect(JSON.parse(text)).toHaveProperty('glyf', '0.1.0');
  expect(JSON.parse(text)).not.toHaveProperty('mosaic');
  await page.getByRole('button', { name: 'Open Demo' }).click();
  await expect(note).toHaveValue('First report');
  await picker.setInputFiles(file);
  await expect(note).toHaveValue('Preserved after a rejected old document');
  await page.getByRole('tab', { name: 'Source' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Source' })).toHaveText(expected);
});

test('downloads current edits offline using the keyboard and reopens the complete document', async ({
  page,
  browserName,
}, testInfo) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Download' });
  await expect(button).toBeDisabled();
  const requests: string[] = [];
  page.context().on('request', (request) => {
    if (!request.url().startsWith('blob:')) requests.push(request.url());
  });
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Open Demo' }).click();
  await expect(button).toBeEnabled();
  const note = page.getByRole('textbox', { name: 'Document note' });
  await note.fill('Saved 雪 😀\nSecond line');
  await page.getByRole('checkbox', { name: 'Show revenue chart' }).uncheck();
  const cell = page.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
  await cell.fill('5000');
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Source' }).click();
  const expected = await page.getByRole('tabpanel', { name: 'Source' }).innerText();
  await page.getByRole('tab', { name: 'Preview' }).click();
  await cell.fill('1e');
  // Reach Download from the selected tab without destroying the invalid draft.
  await page.getByRole('tab', { name: 'Preview' }).focus();
  const tabKey = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
  await page.keyboard.press('Shift+' + tabKey);
  await expect(button).toBeFocused();
  await expect(button).toHaveCSS('outline-width', '3px');
  const pending = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const downloaded = await pending;
  expect(downloaded.suggestedFilename()).toBe('glyf-demo.glyf');
  const file = testInfo.outputPath('edited.glyf');
  await downloaded.saveAs(file);
  await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
  expect(await downloaded.failure()).toBeNull();
  const bytes = await readFile(file);
  expect(bytes).toEqual(Buffer.from(expected, 'utf8'));
  const parsed = parseGlyf(bytes.toString('utf8'));
  expect(parsed.ok).toBe(true);
  expect(bytes.length).toBeLessThanOrEqual(GLYF_LIMITS.fileBytes);
  await expect(cell).toHaveValue('1e');
  await expect(cell).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('img', { name: 'Revenue by month' })).toHaveCount(0);

  await page.getByLabel('Choose a Glyf file').setInputFiles(file);
  await expect(cell).toHaveValue('5000');
  await expect(note).toHaveValue('Saved 雪 😀\nSecond line');
  await expect(page.getByRole('checkbox', { name: 'Show revenue chart' })).not.toBeChecked();
  await page.getByRole('tab', { name: 'Source' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Source' })).toHaveText(expected);
  // Download is available from Source as well as Preview.
  const fromSource = page.waitForEvent('download');
  await button.click();
  await (await fromSource).saveAs(testInfo.outputPath('from-source.glyf'));
  expect(await readFile(testInfo.outputPath('from-source.glyf'))).toEqual(bytes);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect(requests).toEqual([]);
});

test('blocks oversized formatted exports, preserves edits and downloads after correction', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open File' })).toBeVisible();
  const doc = {
    ...minimalDocument(),
    state: { padding: '', note: '' },
    root: { ...minimalDocument().root, children: [nodeSamples.input] },
  };
  const available = GLYF_LIMITS.fileBytes - Buffer.byteLength(JSON.stringify(doc, null, 2) + '\n');
  doc.state.padding = 'é'.repeat(Math.floor(available / 2)) + 'a'.repeat(available % 2);
  await page.getByLabel('Choose a Glyf file').setInputFiles({
    name: 'limit.glyf',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  const note = page.getByRole('textbox', { name: 'Note' });
  await note.fill('é');
  const downloads: string[] = [];
  page.on('download', (file) => downloads.push(file.suggestedFilename()));
  const button = page.getByRole('button', { name: 'Download' });
  await button.click();
  const error = page.getByRole('alert');
  await expect(error).toBeFocused();
  await expect(error).toContainText('Could not download limit.glyf');
  await expect(error).toContainText('FILE_TOO_LARGE');
  await expect(error).toContainText('"" (document root)');
  await expect(note).toHaveValue('é');
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: testInfo.outputPath('download-error-320.png'), fullPage: true });
  expect(downloads).toEqual([]);
  await note.fill('');
  const pending = page.waitForEvent('download');
  await button.click();
  await (await pending).saveAs(testInfo.outputPath('exact-limit.glyf'));
  const bytes = await readFile(testInfo.outputPath('exact-limit.glyf'));
  expect(bytes.length).toBe(GLYF_LIMITS.fileBytes);
  expect(JSON.parse(bytes.toString('utf8')) as GlyfDocument).toEqual(doc);
  await expect(error).toHaveCount(0);
  await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
  expect(downloads).toEqual(['limit.glyf']);
});
