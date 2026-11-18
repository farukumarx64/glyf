import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { MOSAIC_LIMITS } from '../../src/core/limits.ts';
import { parseMosaic } from '../../src/core/parse.ts';
import type { MosaicDocument } from '../../src/core/types.ts';
import { minimalDocument, nodeSamples } from '../fixtures.ts';

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
  expect(downloaded.suggestedFilename()).toBe('mosaic-demo.mosa');
  const file = testInfo.outputPath('edited.mosa');
  await downloaded.saveAs(file);
  expect(await downloaded.failure()).toBeNull();
  const bytes = await readFile(file);
  expect(bytes).toEqual(Buffer.from(expected, 'utf8'));
  const parsed = parseMosaic(bytes.toString('utf8'));
  expect(parsed.ok).toBe(true);
  expect(bytes.length).toBeLessThanOrEqual(MOSAIC_LIMITS.fileBytes);
  await expect(cell).toHaveValue('1e');
  await expect(cell).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('img', { name: 'Revenue by month' })).toHaveCount(0);

  await page.getByLabel('Choose a Mosaic file').setInputFiles(file);
  await expect(cell).toHaveValue('5000');
  await expect(note).toHaveValue('Saved 雪 😀\nSecond line');
  await expect(page.getByRole('checkbox', { name: 'Show revenue chart' })).not.toBeChecked();
  await page.getByRole('tab', { name: 'Source' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Source' })).toHaveText(expected);
  // Download is available from Source as well as Preview.
  const fromSource = page.waitForEvent('download');
  await button.click();
  await (await fromSource).saveAs(testInfo.outputPath('from-source.mosa'));
  expect(await readFile(testInfo.outputPath('from-source.mosa'))).toEqual(bytes);
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
  const available =
    MOSAIC_LIMITS.fileBytes - Buffer.byteLength(JSON.stringify(doc, null, 2) + '\n');
  doc.state.padding = 'é'.repeat(Math.floor(available / 2)) + 'a'.repeat(available % 2);
  await page.getByLabel('Choose a Mosaic file').setInputFiles({
    name: 'limit.mosa',
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
  await expect(error).toContainText('Could not download limit.mosa');
  await expect(error).toContainText('FILE_TOO_LARGE');
  await expect(error).toContainText('"" (document root)');
  await expect(note).toHaveValue('é');
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: testInfo.outputPath('download-error-320.png'), fullPage: true });
  expect(downloads).toEqual([]);
  await note.fill('');
  const pending = page.waitForEvent('download');
  await button.click();
  await (await pending).saveAs(testInfo.outputPath('exact-limit.mosa'));
  const bytes = await readFile(testInfo.outputPath('exact-limit.mosa'));
  expect(bytes.length).toBe(MOSAIC_LIMITS.fileBytes);
  expect(JSON.parse(bytes.toString('utf8')) as MosaicDocument).toEqual(doc);
  await expect(error).toHaveCount(0);
  expect(downloads).toEqual(['limit.mosa']);
});
