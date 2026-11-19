import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { parseMosaic } from '../../src/core/parse.ts';
import type { MosaicDocument, MosaicTheme } from '../../src/core/types.ts';
import { minimalDocument, nodeSamples } from '../fixtures.ts';

function accessibleDocument(
  theme: MosaicTheme = { mode: 'light', accent: 'blue' },
): MosaicDocument {
  const doc = minimalDocument();
  return {
    ...doc,
    meta: { title: 'Accessible workflow' },
    theme,
    state: { note: 'Initial note', count: 0, visible: true },
    datasets: {
      values: {
        columns: [
          { key: 'label', label: ' ', kind: 'string', editable: true },
          { key: 'amount', label: 'Amount', kind: 'number', editable: true },
          { key: 'active', label: 'Enabled', kind: 'boolean', editable: true },
        ],
        rows: [{ id: 'first', label: 'First', amount: -2.5, active: false }],
      },
    },
    root: {
      ...doc.root,
      children: [
        { ...nodeSamples.heading, text: 'Controls and data', level: 2 },
        { ...nodeSamples.input, label: ' ' },
        { ...nodeSamples.input, id: 'count', kind: 'number', bind: 'count', label: 'Count' },
        { ...nodeSamples.stateValue, bind: 'count', prefix: 'Count: ', suffix: '' },
        { ...nodeSamples.toggle, label: ' ' },
        { ...nodeSamples.when, children: [{ ...nodeSamples.text, text: 'Conditional content' }] },
        nodeSamples.table,
        { ...nodeSamples.chart, title: '' },
        {
          ...nodeSamples.markdown,
          text: [
            '[![Disabled image](https://example.org/image.png)](https://example.org/)',
            '[Details](#details)',
            '```text\n' + 'Long code sample '.repeat(40) + '\n```',
          ].join('\n\n'),
        },
        { ...nodeSamples.heading, id: 'details', text: 'Details', level: 2 },
      ],
    },
  };
}

// macOS WebKit includes all controls and links with Option+Tab.
function nextKey(browserName: string) {
  return browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab';
}

async function tabTo(page: Page, target: Locator, key: string) {
  for (let steps = 0; steps < 60; steps++) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      await expect(target).toHaveCSS('outline-style', 'solid');
      expect(
        parseFloat(await target.evaluate((element) => getComputedStyle(element).outlineWidth)),
      ).toBeGreaterThanOrEqual(2);
      return;
    }
    await page.keyboard.press(key);
  }
  throw new Error('Could not reach the requested control using the keyboard');
}

async function open(page: Page, value: MosaicDocument) {
  await page.goto('/');
  await page.getByLabel('Choose a Mosaic file').setInputFiles({
    name: 'accessibility.mosa',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(value)),
  });
  await expect(page.getByRole('tab', { name: 'Preview' })).toBeFocused();
}

function contrast(a: string, b: string) {
  function luminance(color: string) {
    const values = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map((value) => {
        const channel = Number(value) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
    return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
  }
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

test('makes wide Markdown code keyboard-scrollable without unnamed image links', async ({
  page,
  browserName,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await open(page, accessibleDocument());
  await expect(page.locator('.mosaic-markdown a')).toHaveCount(1);
  await expect(page.locator('.mosaic-markdown a')).toHaveAccessibleName('Details');
  const block = page.getByRole('group', { name: 'Code block' });
  await expect(block).toHaveAttribute('tabindex', '0');
  await tabTo(page, block, nextKey(browserName));
  await expect(block).toBeInViewport();
  expect(await block.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  // WebKit can still be completing the focus scroll when the first arrow arrives.
  // Repeat the real keyboard action rather than sleeping or setting scrollLeft.
  await expect(async () => {
    await expect(block).toBeFocused();
    await page.keyboard.press('ArrowRight', { delay: 100 });
    expect(await block.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  }).toPass({ timeout: 5000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

async function checkRelationships(page: Page) {
  const problems = await page.evaluate(() => {
    const issues: string[] = [];
    const ids = new Set<string>();
    for (const element of document.querySelectorAll('[id]')) {
      if (ids.has(element.id)) issues.push('Repeated ID: ' + element.id);
      ids.add(element.id);
    }
    for (const attribute of ['aria-labelledby', 'aria-describedby', 'aria-controls', 'for']) {
      for (const element of document.querySelectorAll('[' + attribute + ']')) {
        for (const id of element.getAttribute(attribute)!.split(/\s+/)) {
          if (!document.getElementById(id)) issues.push(attribute + ' cannot resolve ' + id);
        }
      }
    }
    return issues;
  });
  expect(problems).toEqual([]);
  for (const control of await page
    .locator('button:visible, input:visible, textarea:visible, select:visible, a[href]:visible')
    .all()) {
    await expect(control).toHaveAccessibleName(/\S/);
  }
}

async function typeValue(page: Page, text: string) {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText(text);
}

for (const mode of ['light', 'dark'] as const) {
  test(`completes an offline ${mode} workflow using keyboard navigation and accessible feedback`, async ({
    page,
    browser,
    browserName,
  }, testInfo) => {
    await page.setViewportSize({ width: mode === 'light' ? 320 : 375, height: 740 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open File' })).toBeVisible();
    const requests: string[] = [],
      errors: string[] = [],
      dialogs: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('blob:')) requests.push(request.url());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message());
      await dialog.dismiss();
    });
    await page.context().setOffline(true);
    const key = nextKey(browserName);
    const openFile = page.getByRole('button', { name: 'Open File' });
    const choose = async (file: string | { name: string; mimeType: string; buffer: Buffer }) => {
      await tabTo(page, openFile, key);
      const chooser = page.waitForEvent('filechooser');
      await page.keyboard.press('Enter');
      await (await chooser).setFiles(file);
    };
    const doc = accessibleDocument({
      mode,
      accent: mode === 'light' ? 'blue' : 'teal',
      density: mode === 'light' ? 'comfortable' : 'compact',
    });
    await choose({
      name: 'keyboard.mosa',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(doc)),
    });
    const preview = page.getByRole('tab', { name: 'Preview' });
    await expect(preview).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Source' })).toHaveAttribute('tabindex', '-1');
    await checkRelationships(page);
    await expect(
      page.getByRole('table', { name: 'values', exact: true }).getByRole('columnheader'),
    ).toHaveText(['label', 'Amount', 'Enabled']);
    for (const header of await page.getByRole('columnheader').all())
      await expect(header).toHaveAttribute('scope', 'col');
    await expect(
      page.getByRole('img', { name: 'values', exact: true }),
    ).toHaveAccessibleDescription(/1 point/);

    const note = page.getByRole('textbox', { name: 'note', exact: true });
    await tabTo(page, note, key);
    await typeValue(page, 'Saved 雪 😀\nKeyboard note');
    await expect(note).toBeFocused();
    const dirty = page.locator('.file-name');
    await expect(dirty).toHaveAttribute('aria-live', 'polite');
    await expect(dirty).toHaveAttribute('aria-atomic', 'true');
    await expect(dirty).toContainText('Unsaved changes');

    const count = page.getByRole('textbox', { name: 'Count', exact: true });
    await tabTo(page, count, key);
    await typeValue(page, '-');
    await expect(count).toBeFocused();
    await expect(count).toHaveAttribute('aria-invalid', 'true');
    await expect(count).toHaveAccessibleDescription('Enter a finite decimal number.');
    const stateError = page.getByRole('alert');
    expect(await stateError.getAttribute('id')).toBe(await count.getAttribute('aria-describedby'));
    await expect(page.getByText('Count: 0', { exact: true })).toBeVisible();
    await checkRelationships(page);
    await page.screenshot({ path: testInfo.outputPath('state-error.png'), fullPage: true });
    await page.keyboard.press('Escape');
    await expect(count).toHaveValue('0');
    await expect(count).not.toHaveAttribute('aria-describedby');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await typeValue(page, '7.5');
    await expect(page.getByText('Count: 7.5', { exact: true })).toBeVisible();
    const toggle = page.getByRole('checkbox', { name: 'visible', exact: true });
    await tabTo(page, toggle, key);
    await page.keyboard.press('Space');
    await expect(toggle).toBeFocused();
    await expect(toggle).not.toBeChecked();
    await expect(page.getByText('Conditional content')).toHaveCount(0);

    const label = page.getByRole('textbox', { name: 'label, row first', exact: true });
    await tabTo(page, label, key);
    await typeValue(page, 'Updated row');
    const amount = page.getByRole('textbox', { name: 'Amount, row first', exact: true });
    await tabTo(page, amount, key);
    await typeValue(page, '1e');
    await expect(amount).toBeFocused();
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
    await expect(amount).toHaveAccessibleDescription(
      'Enter a finite decimal number, or choose No value.',
    );
    expect(await page.getByRole('alert').getAttribute('id')).toBe(
      await amount.getAttribute('aria-describedby'),
    );
    await page.keyboard.press('Escape');
    await expect(amount).toHaveValue('-2.5');
    await tabTo(page, page.getByRole('button', { name: 'Set Amount, row first to no value' }), key);
    await page.keyboard.press('Space');
    await expect(amount).toHaveValue('');
    await expect(page.getByRole('img')).toHaveCount(0);
    await page.keyboard.press('Shift+' + key);
    await expect(amount).toBeFocused();
    await typeValue(page, '8');
    await expect(
      page.getByRole('img', { name: 'values', exact: true }),
    ).toHaveAccessibleDescription(/1 point.*8/);
    const active = page.getByRole('combobox', { name: 'Enabled, row first', exact: true });
    await tabTo(page, active, key);
    // Native select type-ahead also works when a headless macOS browser does
    // not display its operating-system popup menu for the arrow keys.
    await page.keyboard.press('t');
    await expect(active).toHaveValue('true');

    // A declined native confirmation must return to the invoking control.
    const demo = page.getByRole('button', { name: 'Open Demo' });
    await tabTo(page, demo, key);
    await page.keyboard.press('Enter');
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toContain('unsaved changes');
    await expect(page.locator('.loading')).toHaveCount(0);
    await expect(demo).toBeFocused();
    await expect(note).toHaveValue('Saved 雪 😀\nKeyboard note');

    await tabTo(page, preview, key);
    await page.keyboard.press('End');
    const sourceTab = page.getByRole('tab', { name: 'Source' });
    await expect(sourceTab).toBeFocused();
    const sourcePanel = page.getByRole('tabpanel', { name: 'Source' });
    await page.keyboard.press(key);
    await expect(sourcePanel).toBeFocused();
    const expected = {
      ...doc,
      state: { note: 'Saved 雪 😀\nKeyboard note', count: 7.5, visible: false },
      datasets: {
        values: {
          ...doc.datasets!.values!,
          rows: [{ id: 'first', label: 'Updated row', amount: 8, active: true }],
        },
      },
    };
    expect(await sourcePanel.textContent()).toBe(JSON.stringify(expected, null, 2) + '\n');
    await page.keyboard.press('Shift+' + key);
    await page.keyboard.press('Home');
    await expect(preview).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(sourceTab).toBeFocused();
    await checkRelationships(page);
    const downloadButton = page.getByRole('button', { name: 'Download' });
    await page.keyboard.press('Shift+' + key);
    await expect(downloadButton).toBeFocused();
    const pending = page.waitForEvent('download');
    await page.keyboard.press('Enter');
    const downloaded = await pending;
    const saved = testInfo.outputPath('keyboard-edits.mosa');
    await downloaded.saveAs(saved);
    await expect(downloadButton).toBeFocused();
    await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
    const text = await readFile(saved, 'utf8');
    expect(text).toBe(JSON.stringify(expected, null, 2) + '\n');
    expect(parseMosaic(text)).toEqual({ ok: true, document: expected });
    await choose(saved);
    await expect(preview).toBeFocused();
    await expect(note).toHaveValue('Saved 雪 😀\nKeyboard note');
    await expect(count).toHaveValue('7.5');
    await expect(toggle).not.toBeChecked();
    await expect(amount).toHaveValue('8');
    await expect(active).toHaveValue('true');
    await checkRelationships(page);

    await choose({ name: 'broken.mosa', mimeType: 'application/json', buffer: Buffer.from('{') });
    const error = page.getByRole('alert', { name: 'Could not open broken.mosa' });
    await expect(error).toBeFocused();
    await expect(error).toContainText('INVALID_JSON');
    await checkRelationships(page);
    await page.keyboard.press(key);
    await expect(preview).toBeFocused();
    await choose(saved);
    await expect(preview).toBeFocused();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(note).toHaveValue('Saved 雪 😀\nKeyboard note');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
      mode === 'light' ? 320 : 375,
    );
    await page.screenshot({ path: testInfo.outputPath('reopened.png'), fullPage: true });
    await writeFile(
      testInfo.outputPath('accessibility-tree.yml'),
      await page.getByRole('main').ariaSnapshot(),
    );
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
    expect(dialogs).toHaveLength(1);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await writeFile(
      testInfo.outputPath('workflow-results.json'),
      JSON.stringify(
        {
          browser: browser.version(),
          mode,
          requests,
          errors,
          dialogs,
          exportBytes: Buffer.byteLength(text),
        },
        null,
        2,
      ) + '\n',
    );
  });
}

test('keeps keyboard navigation in Preview when conditional controls remove themselves', async ({
  page,
  browserName,
}) => {
  const doc = minimalDocument();
  await open(page, {
    ...doc,
    state: { visible: true, count: 0, note: '' },
    root: {
      ...doc.root,
      children: [
        { ...nodeSamples.when, children: [nodeSamples.toggle] },
        {
          ...nodeSamples.when,
          id: 'numberWhen',
          bind: 'count',
          equals: 0,
          children: [{ ...nodeSamples.input, kind: 'number', bind: 'count', label: 'Count' }],
        },
        { ...nodeSamples.input, id: 'outside', label: 'Outside' },
      ],
    },
  });
  const key = nextKey(browserName);
  await tabTo(page, page.getByRole('checkbox', { name: 'Visible' }), key);
  await page.keyboard.press('Space');
  await expect(page.getByRole('tabpanel', { name: 'Preview' })).toBeFocused();
  await page.keyboard.press(key);
  await expect(page.getByRole('textbox', { name: 'Count', exact: true })).toBeFocused();
  await typeValue(page, '1');
  await expect(page.getByRole('tabpanel', { name: 'Preview' })).toBeFocused();
  await page.keyboard.press(key);
  await expect(page.getByRole('textbox', { name: 'Outside' })).toBeFocused();
});

test('reflows Preview and Source at 200 percent text size on a narrow screen', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await open(page, accessibleDocument());
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  for (const tab of await page.getByRole('tab').all()) {
    const textLines = await tab.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getClientRects().length;
    });
    expect(textLines).toBe(1);
  }
  await page.screenshot({ path: testInfo.outputPath('preview-text-200.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Source' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.screenshot({ path: testInfo.outputPath('source-text-200.png'), fullPage: true });
});

test('keeps text, focus and control boundaries distinguishable across theme tokens', async ({
  page,
  browserName,
}, testInfo) => {
  const measurements: object[] = [];
  await page.setViewportSize({ width: 320, height: 740 });
  for (const mode of ['light', 'dark'] as const) {
    for (const accent of ['blue', 'teal', 'amber'] as const) {
      for (const density of ['comfortable', 'compact'] as const) {
        await open(page, accessibleDocument({ mode, accent, density }));
        const field = page.getByRole('textbox', { name: 'Count', exact: true });
        await tabTo(page, field, nextKey(browserName));
        const colors = await field.evaluate((element) => {
          const style = getComputedStyle(element);
          const primary = getComputedStyle(document.querySelector('.primary-action')!);
          const sheet = getComputedStyle(document.querySelector('.document-sheet')!);
          const link = getComputedStyle(document.querySelector('.mosaic-markdown a')!);
          const muted = getComputedStyle(document.querySelector('.mosaic-chart > p')!);
          return {
            ink: style.color,
            background: style.backgroundColor,
            border: style.borderColor,
            focus: style.outlineColor,
            primaryInk: primary.color,
            primaryFill: primary.backgroundColor,
            sheet: sheet.backgroundColor,
            link: link.color,
            muted: muted.color,
          };
        });
        await typeValue(page, '-');
        const errorInk = await page
          .getByRole('alert')
          .evaluate((element) => getComputedStyle(element).color);
        const ratios = {
          text: contrast(colors.ink, colors.background),
          border: contrast(colors.border, colors.background),
          focus: contrast(colors.focus, colors.background),
          primaryText: contrast(colors.primaryInk, colors.primaryFill),
          link: contrast(colors.link, colors.sheet),
          mutedText: contrast(colors.muted, colors.sheet),
          errorText: contrast(errorInk, colors.sheet),
        };
        for (const [kind, ratio] of Object.entries(ratios))
          expect(ratio, `${mode}/${accent}/${density}/${kind}`).toBeGreaterThanOrEqual(
            kind === 'border' || kind === 'focus' ? 3 : 4.5,
          );
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
        measurements.push({ mode, accent, density, colors, errorInk, ratios });
      }
    }
  }
  await writeFile(
    testInfo.outputPath('contrast-results.json'),
    JSON.stringify(measurements, null, 2) + '\n',
  );
});
