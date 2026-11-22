import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { jsonPointer } from '../../src/core/json-pointer.ts';
import { parseGlyf } from '../../src/core/parse.ts';
import { minimalDocument, nodeSamples } from '../fixtures.ts';
import { maliciousMarkdown, nestedMarkdown } from '../security-fixtures.ts';

async function observeOffline(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Demo' })).toBeVisible();
  const requests: string[] = [];
  const errors: string[] = [];
  page.context().on('request', (request) => {
    if (!request.url().startsWith('blob:')) requests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => Reflect.set(globalThis, 'glyfExecuted', false));
  await page.context().setOffline(true);
  return { requests, errors };
}

test('contains malicious Markdown without execution, embeds, requests or document mutation', async ({
  page,
}) => {
  const observed = await observeOffline(page);
  const doc = minimalDocument();
  const value = {
    ...doc,
    root: {
      ...doc.root,
      children: [
        { ...nodeSamples.markdown, text: maliciousMarkdown },
        { ...nodeSamples.heading, id: 'constructor' },
      ],
    },
  };
  await page.getByLabel('Choose a Glyf file').setInputFiles({
    name: 'malicious-markdown.glyf',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  const markdown = page.locator('.glyf-markdown');
  await expect(markdown.locator('strong')).toHaveText('Readable');
  await expect(
    markdown.locator(
      'script, svg, math, img, iframe, object, embed, video, audio, source, style, link, base, meta, form, input',
    ),
  ).toHaveCount(0);
  await expect(page.locator('link[as="image"]')).toHaveCount(0);
  await expect(markdown.locator('code')).toHaveText(
    '<img src=x onerror="globalThis.glyfExecuted=true">',
  );
  for (const name of [
    'Script',
    'Control',
    'Data',
    'Blob',
    'Relative',
    'File',
    'Legacy',
    'Image link',
  ]) {
    await expect(markdown).toContainText(name);
    await expect(markdown.getByRole('link', { name, exact: true })).toHaveCount(0);
  }
  expect(
    await markdown.locator('a').evaluateAll((links) =>
      links.map((link) => ({
        href: link.getAttribute('href'),
        target: link.getAttribute('target'),
        rel: link.getAttribute('rel'),
      })),
    ),
  ).toEqual([
    { href: '#glyf-node-constructor', target: null, rel: null },
    { href: 'https://example.org/', target: '_blank', rel: 'noopener noreferrer' },
    { href: 'mailto:team@example.org', target: null, rel: 'noopener noreferrer' },
  ]);
  await markdown.getByRole('link', { name: 'Jump' }).click();
  await expect(page.locator(':target')).toHaveText('Heading');
  expect(await page.evaluate(() => Reflect.get(globalThis, 'glyfExecuted'))).toBe(false);
  await page.getByRole('tab', { name: 'Source' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Source' })).toHaveText(
    JSON.stringify(value, null, 2) + '\n',
  );
  expect(observed).toEqual({ requests: [], errors: [] });
});

for (const { name, text } of nestedMarkdown) {
  test(`recovers from deeply nested ${name} and keeps editing and download available`, async ({
    page,
  }) => {
    const observed = await observeOffline(page);
    const doc = minimalDocument();
    const value = {
      ...doc,
      state: { note: 'Before' },
      root: {
        ...doc.root,
        children: [{ ...nodeSamples.markdown, text }, nodeSamples.heading, nodeSamples.input],
      },
    };
    await page.setViewportSize({ width: 320, height: 740 });
    await page.getByLabel('Choose a Glyf file').setInputFiles({
      name: 'nested.glyf',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(value)),
    });
    await expect(page.getByRole('note')).toContainText('Showing the original text');
    expect(await page.locator('.glyf-markdown pre').textContent()).toBe(text);
    await expect(page.locator('.glyf-markdown img')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await expect(page.getByRole('heading', { name: 'Heading', exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Note', exact: true }).fill('After');
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download' }).click();
    const download = await downloaded;
    const path = await download.path();
    if (!path) throw new Error('Expected a local downloaded file');
    const reopened = parseGlyf(await readFile(path, 'utf8'));
    expect(reopened).toEqual({ ok: true, document: { ...value, state: { note: 'After' } } });
    await page.getByRole('button', { name: 'Open Demo' }).click();
    await expect(
      page.getByRole('heading', { name: 'Glyf: First Interactive Document' }),
    ).toBeVisible();
    await expect(page.getByRole('note')).toHaveCount(0);
    expect(await page.evaluate(() => Reflect.get(globalThis, 'glyfExecuted'))).toBe(false);
    expect(observed).toEqual({ requests: [], errors: [] });
  });
}

test('renders hostile diagnostics as text and preserves edits after rejected files', async ({
  page,
}) => {
  const observed = await observeOffline(page);
  await page.getByRole('button', { name: 'Open Demo' }).click();
  const note = page.getByRole('textbox', { name: 'Document note' });
  await note.fill('Keep these edits');
  const unknown = '<img src=x onerror="globalThis.glyfExecuted=true">/~';
  const cases = [
    { buffer: Buffer.from([0xef, 0xbb, 0xbf, 0xc0, 0xaf]), code: 'INVALID_UTF8', path: '""' },
    {
      buffer: Buffer.from('{"glyf":"0.1.0","state":{"a/b~":1,"a\\u002fb~":2}}'),
      code: 'INVALID_JSON',
      path: '/state/a~1b~0',
    },
    {
      buffer: Buffer.from(JSON.stringify({ ...minimalDocument(), [unknown]: true })),
      code: 'SCHEMA_ERROR',
      path: jsonPointer(unknown),
    },
    {
      buffer: Buffer.from(JSON.stringify({ ...minimalDocument(), state: { constructor: null } })),
      code: 'INVALID_BINDING',
      path: '/state/constructor',
    },
  ];
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  for (const { buffer, code, path } of cases) {
    await page.getByLabel('Choose a Glyf file').setInputFiles({
      name: '<svg onload=alert(1)>.glyf',
      mimeType: 'application/json',
      buffer,
    });
    const alert = page.getByRole('alert');
    await expect(alert).toBeFocused();
    await expect(alert).toContainText(code);
    await expect(alert).toContainText(path);
    await expect(alert.getByRole('heading')).toContainText('<svg onload=alert(1)>.glyf');
    await expect(alert.locator('img, svg, script')).toHaveCount(0);
    await expect(note).toHaveValue('Keep these edits');
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  }
  expect(dialogs).toEqual([]);
  expect(await page.evaluate(() => Reflect.get(globalThis, 'glyfExecuted'))).toBe(false);
  expect(observed).toEqual({ requests: [], errors: [] });
});
