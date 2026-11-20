import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { minimalDocument, nodeSamples } from '../fixtures.ts';

// Keep the viewer's inline layout/theme styles, but permit neither inline scripts
// nor string evaluation. This is the policy that exposed the startup failure.
const policy =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "connect-src 'none'; object-src 'none'; base-uri 'none'";

test.use({ bypassCSP: false });

test('starts, validates, edits and exports offline under a CSP without unsafe-eval', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const violations: string[] = [];
    Reflect.set(window, 'mosaicCspViolations', violations);
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
  });
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': policy },
    });
  });
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(policy);
  await expect(page.getByRole('button', { name: 'Open Demo' })).toBeVisible();

  const requests: string[] = [];
  page.context().on('request', (request) => {
    if (!request.url().startsWith('blob:')) requests.push(request.url());
  });
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Open Demo' }).click();
  await expect(page.locator('.mosaic-markdown strong')).toHaveText('offline-first');
  const chart = page.getByRole('img', { name: 'Revenue by month' });
  await expect(chart).toBeVisible();
  const cell = page.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
  await cell.fill('-125.5');
  await expect(chart).toHaveAccessibleDescription(/Values range from -125.5/);
  await page.getByRole('textbox', { name: 'Document note' }).fill('Saved under strict CSP 😀');
  await expect(page.locator('#mosaic-node-noteDisplay')).toHaveText(
    'Current note: Saved under strict CSP 😀',
  );
  await page.getByRole('checkbox', { name: 'Show revenue chart' }).uncheck();
  await expect(chart).toHaveCount(0);

  const minimal = minimalDocument();
  for (const { source, code, path } of [
    { source: '{', code: 'INVALID_JSON', path: '""' },
    {
      source: JSON.stringify({ ...minimal, meta: { title: 42 } }),
      code: 'SCHEMA_ERROR',
      path: '/meta/title',
    },
    {
      source: JSON.stringify({
        ...minimal,
        root: { ...minimal.root, children: [nodeSamples.toggle] },
      }),
      code: 'INVALID_BINDING',
      path: '/root/children/0/bind',
    },
  ]) {
    await page.getByLabel('Choose a Mosaic file').setInputFiles({
      name: 'invalid.mosa',
      mimeType: 'application/json',
      buffer: Buffer.from(source),
    });
    await expect(page.getByRole('alert')).toContainText(code);
    await expect(page.getByRole('alert')).toContainText(path);
    await expect(cell).toHaveValue('-125.5');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  }

  const original = JSON.parse(
    await readFile(new URL('../../examples/mosaic-demo.mosa', import.meta.url), 'utf8'),
  );
  original.datasets.revenue.rows[0].amount = -125.5;
  original.state.note = 'Saved under strict CSP 😀';
  original.state.showChart = false;
  const savedText = JSON.stringify(original, null, 2) + '\n';
  await page.getByRole('tab', { name: 'Source' }).click();
  expect(await page.getByRole('tabpanel', { name: 'Source' }).innerText()).toBe(savedText);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download' }).click();
  const download = await pending;
  expect(await download.failure()).toBeNull();
  const savedPath = await download.path();
  if (!savedPath) throw new Error('Expected a downloaded document');
  expect(await readFile(savedPath, 'utf8')).toBe(savedText);
  await page.getByLabel('Choose a Mosaic file').setInputFiles(savedPath);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(cell).toHaveValue('-125.5');
  await expect(page.getByRole('textbox', { name: 'Document note' })).toHaveValue(
    'Saved under strict CSP 😀',
  );
  await expect(page.getByRole('checkbox', { name: 'Show revenue chart' })).not.toBeChecked();
  await expect(chart).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'mosaicCspViolations'))).toEqual([]);
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});
