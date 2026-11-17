import { expect, test, type Page } from '@playwright/test';
import type { MosaicDocument, MosaicTheme } from '../../src/core/types.ts';
import { minimalDocument, nodeSamples } from '../fixtures.ts';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Demo' })).toBeVisible();
});

async function openDocument(page: Page, doc: MosaicDocument) {
  await page.getByLabel('Choose a Mosaic file').setInputFiles({
    name: doc.id + '.mosa',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  });
  await expect(page.getByRole('heading', { name: doc.meta.title, exact: true })).toBeVisible();
}

async function goOffline(page: Page) {
  const requests: string[] = [];
  page.context().on('request', (request) => requests.push(request.url()));
  await page.context().setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  return requests;
}

// macOS WebKit uses Option+Tab to include links and controls in keyboard navigation.
function nextFocusKey(browserName: string) {
  return browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
}

test('opens the bundled demo offline and navigates the viewer using only the keyboard', async ({
  page,
  browserName,
}) => {
  const tabKey = nextFocusKey(browserName);
  const requests = await goOffline(page);
  const demo = page.getByRole('button', { name: 'Open Demo' });
  await page.keyboard.press(tabKey);
  await expect(demo).toBeFocused();
  await expect(demo).toHaveCSS('outline-style', 'solid');
  await expect(demo).toHaveCSS('outline-width', '3px');
  await page.keyboard.press(tabKey);
  await expect(page.getByRole('button', { name: 'Open File' })).toBeFocused();
  await page.keyboard.press(tabKey);
  await expect(page.getByRole('button', { name: /Drop a .mosa file/ })).toBeFocused();
  await page.keyboard.press('Shift+' + tabKey);
  await page.keyboard.press('Shift+' + tabKey);
  await page.keyboard.press('Enter');

  const preview = page.getByRole('tab', { name: 'Preview' });
  const source = page.getByRole('tab', { name: 'Source' });
  await expect(preview).toBeFocused();
  await expect(preview).toHaveCSS('outline-style', 'solid');
  await expect(
    page.getByRole('heading', { name: 'Mosaic: First Interactive Document' }),
  ).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Document note' })).toHaveValue('First report');
  await expect(page.getByRole('checkbox', { name: 'Show revenue chart' })).toBeDisabled();
  const revenue = page.getByRole('table', { name: 'revenue', exact: true });
  await expect(revenue.getByRole('columnheader')).toHaveText(['Month', 'Revenue (NGN)']);
  await expect(revenue.getByRole('cell')).toHaveText(['Jan', '1200', 'Feb', '1800', 'Mar', '2500']);
  await page.keyboard.press('ArrowRight');
  await expect(source).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Source' })).toContainText(
    '"id": "sample_overview"',
  );
  await page.keyboard.press(tabKey);
  await expect(page.getByRole('tabpanel', { name: 'Source' })).toBeFocused();
  await page.keyboard.press('Shift+' + tabKey);
  await page.keyboard.press('Home');
  await expect(preview).toBeFocused();
  await page.keyboard.press('End');
  await expect(source).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tabpanel', { name: 'Preview' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  expect(requests).toEqual([]);
});

test('scrolls a wide table and reveals successive rows with the keyboard', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const doc = minimalDocument();
  const columns = Array.from({ length: 12 }, (_, i) => ({
    key: 'c' + i,
    label: 'Column ' + i,
    kind: 'number' as const,
  }));
  const rows = Array.from({ length: 201 }, (_, i) => ({
    id: 'r' + i,
    ...Object.fromEntries(columns.map(({ key }) => [key, i + 1])),
  }));
  const wide = {
    ...doc,
    datasets: { values: { columns, rows } },
    root: { ...doc.root, children: [nodeSamples.table] },
  };
  await openDocument(page, wide);
  const table = page.getByRole('table', { name: 'values', exact: true });
  const scroller = page.getByRole('group', { name: 'values table' });
  const bodyRows = table.locator('tbody tr');
  await expect(bodyRows).toHaveCount(100);
  expect(await scroller.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);

  const tab = nextFocusKey(browserName);
  await page.keyboard.press(tab); // Preview panel
  await page.keyboard.press(tab);
  await expect(scroller).toBeFocused();
  await page.keyboard.press('ArrowRight', { delay: 100 });
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await page.keyboard.press(tab);
  await expect(page.getByRole('button', { name: 'Show 100 more rows' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(bodyRows).toHaveCount(200);
  await expect(bodyRows.nth(100)).toBeFocused();
  await expect(bodyRows.nth(100).getByRole('cell').first()).toHaveText('101');
  await page.keyboard.press(tab);
  await expect(page.getByRole('button', { name: 'Show 1 more row' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(bodyRows).toHaveCount(201);
  await expect(bodyRows.last()).toBeFocused();
  await expect(page.getByRole('status')).toHaveText('Showing 201 of 201 rows');
  await expect(page.getByRole('button', { name: /more rows?/ })).toHaveCount(0);

  await openDocument(page, wide);
  await expect(bodyRows).toHaveCount(100);
});

test('reports malformed files offline, keeps the open Source, and recovers', async ({ page }) => {
  const requests = await goOffline(page);
  const uncaught: string[] = [];
  page.on('pageerror', (error) => uncaught.push(error.message));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Open File' }).click();
  await (await chooser).setFiles({ name: 'broken.mosa', mimeType: '', buffer: Buffer.from('{') });
  const alert = page.getByRole('alert');
  await expect(alert).toBeFocused();
  await expect(alert).toContainText('INVALID_JSON');
  await expect(alert).toContainText('"" (document root)');
  await expect(page.getByRole('tablist')).toHaveCount(0);

  await page.getByRole('button', { name: 'Open Demo' }).click();
  await page.getByRole('tab', { name: 'Source' }).click();
  const source = page.getByRole('tabpanel', { name: 'Source' });
  const original = await source.innerText();
  const picker = page.getByLabel('Choose a Mosaic file');
  await picker.setInputFiles({ name: 'encoding.mosa', mimeType: '', buffer: Buffer.from([255]) });
  await expect(alert).toContainText('INVALID_UTF8');
  await expect(alert).toContainText('"" (document root)');
  await picker.setInputFiles('examples/invalid/missing-binding.mosa');
  await expect(alert).toBeFocused();
  await expect(alert).toContainText('State key "absent" is not declared.');
  await expect(alert).toContainText('INVALID_BINDING');
  await expect(alert).toContainText('/root/children/0/children/0/bind');
  await expect(source).toBeVisible();
  expect(await source.innerText()).toBe(original);
  await openDocument(page, minimalDocument());
  await expect(alert).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Preview' })).toBeFocused();
  expect(uncaught).toEqual([]);
  expect(requests).toEqual([]);
});

test('reflows row and grid children and keeps wide code and Source inside their panels', async ({
  page,
}) => {
  const doc = minimalDocument();
  const tiles = Array.from({ length: 4 }, (_, i) => ({ ...nodeSamples.card, id: 'tile' + i }));
  const nested = { ...nodeSamples.grid, id: 'nested', children: [nodeSamples.divider] };
  await openDocument(page, {
    ...doc,
    root: {
      ...doc.root,
      children: [
        {
          ...nodeSamples.grid,
          children: [{ ...tiles[0]!, children: [nested] }, ...tiles.slice(1)],
        },
        {
          ...nodeSamples.row,
          children: [
            {
              ...nodeSamples.text,
              id: 'first',
              text: 'First row item with a readable line of text.',
            },
            {
              ...nodeSamples.text,
              id: 'second',
              text: 'Second row item with a readable line of text.',
            },
          ],
        },
        { ...nodeSamples.markdown, text: '~~~\n' + 'x'.repeat(240) + '\n~~~' },
      ],
    },
  });
  const grid = page.locator('#mosaic-node-grid');
  const row = page.locator('.mosaic-row');
  for (const [width, columns] of [
    [1280, 4],
    [375, 1],
    [320, 1],
  ] as const) {
    await page.setViewportSize({ width, height: 800 });
    await page.getByRole('tab', { name: 'Preview' }).click();
    const positions = await grid
      .locator(':scope > *')
      .evaluateAll((tiles) => tiles.map((tile) => tile.getBoundingClientRect().left));
    expect(new Set(positions).size).toBe(columns);
    const rowTops = await row
      .locator(':scope > *')
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
    expect(new Set(rowTops).size).toBe(width === 1280 ? 1 : 2);
    await expect(page.locator('#mosaic-node-nested')).toHaveCSS(
      'grid-template-columns',
      /^[\d.]+px$/,
    );
    expect(
      await page.locator('.mosaic-markdown pre').evaluate((el) => el.scrollWidth > el.clientWidth),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await page.getByRole('tab', { name: 'Source' }).click();
    expect(
      await page
        .getByRole('tabpanel', { name: 'Source' })
        .evaluate((el) => el.scrollWidth > el.clientWidth),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test('applies mode, accent, and density, follows system changes, and resets on replacement', async ({
  page,
}) => {
  const doc = minimalDocument();
  const children = [
    nodeSamples.card,
    nodeSamples.row,
    { ...nodeSamples.markdown, text: '[Notes](#card)' },
  ];
  function themed(title: string, theme?: MosaicTheme): MosaicDocument {
    return { ...doc, meta: { title }, ...(theme && { theme }), root: { ...doc.root, children } };
  }
  const sheet = page.locator('.document-sheet');
  const card = page.locator('.mosaic-card');
  const root = page.locator('.mosaic-column');
  const link = page.getByRole('link', { name: 'Notes' });
  await openDocument(page, themed('Default theme'));
  await expect(sheet).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(link).toHaveCSS('color', 'rgb(33, 89, 173)');
  await expect(root).toHaveCSS('gap', '12px');
  await expect(card).toHaveCSS('padding-top', '16px');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(sheet).toHaveCSS('background-color', 'rgb(25, 37, 53)');
  await expect(link).toHaveCSS('color', 'rgb(151, 190, 255)');

  await openDocument(page, themed('Light amber', { mode: 'light', accent: 'amber' }));
  await expect(sheet).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(link).toHaveCSS('color', 'rgb(132, 80, 0)');
  await page.emulateMedia({ colorScheme: 'light' });
  await openDocument(
    page,
    themed('Dark teal', { mode: 'dark', accent: 'teal', density: 'compact' }),
  );
  await expect(sheet).toHaveCSS('background-color', 'rgb(25, 37, 53)');
  await expect(link).toHaveCSS('color', 'rgb(117, 220, 203)');
  await expect(root).toHaveCSS('gap', '8px');
  await expect(card).toHaveCSS('padding-top', '12px');
  await expect(page.locator('.mosaic-row')).toHaveCSS('gap', '24px');
  // A rejected replacement must preserve the active document's theme.
  await page.getByLabel('Choose a Mosaic file').setInputFiles({
    name: 'unknown-accent.mosa',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...doc, theme: { accent: 'violet' } })),
  });
  await expect(page.getByRole('alert')).toContainText('SCHEMA_ERROR');
  await expect(link).toHaveCSS('color', 'rgb(117, 220, 203)');
  await openDocument(page, themed('Fresh document'));
  await expect(sheet).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(link).toHaveCSS('color', 'rgb(33, 89, 173)');
  await expect(root).toHaveCSS('gap', '12px');
});

test('renders safe Markdown, keeps rejected labels, and opens a local anchor without any request', async ({
  page,
  browserName,
}) => {
  const tabKey = nextFocusKey(browserName);
  const requests = await goOffline(page);
  const doc = minimalDocument();
  const markdown = [
    '**Formatted** [Jump](#heading) [Web](https://example.org/) [Mail](mailto:team@example.org)',
    '[Blocked](javascript:sample) [Relative](//example.org) ![Picture](https://example.org/missing.png)',
    '<script type="application/json">{"example":true}</script>',
    '<svg><title>Raw SVG</title></svg>',
    '<img src="https://example.org/raw.png">',
    '~~~html\n<b>literal code</b>\n~~~',
  ].join('\n\n');
  await openDocument(page, {
    ...doc,
    root: {
      ...doc.root,
      children: [{ ...nodeSamples.markdown, text: markdown }, nodeSamples.heading],
    },
  });
  const content = page.locator('.mosaic-markdown');
  await expect(content.locator('strong')).toHaveText('Formatted');
  await expect(content.locator('code')).toHaveText('<b>literal code</b>');
  await expect(content).toContainText('Blocked Relative');
  await expect(content.locator('script, svg, img, iframe, b')).toHaveCount(0);
  await expect(page.locator('link[as="image"]')).toHaveCount(0);
  await expect(content.getByRole('link')).toHaveCount(3);
  const web = content.getByRole('link', { name: 'Web' });
  await expect(web).toHaveAttribute('href', 'https://example.org/');
  await expect(web).toHaveAttribute('target', '_blank');
  await expect(web).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(content.getByRole('link', { name: 'Mail' })).toHaveAttribute(
    'href',
    'mailto:team@example.org',
  );
  await page.keyboard.press(tabKey); // From the selected Preview tab to its panel.
  await page.keyboard.press(tabKey);
  const jump = content.getByRole('link', { name: 'Jump' });
  await expect(jump).toBeFocused();
  await expect(jump).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.locator(':target')).toHaveText('Heading');
  expect(requests).toEqual([]);
});
