import { expect, test, type Page } from '@playwright/test';
import { minimalDocument } from '../fixtures.ts';

async function replace(page: Page, route: 'demo' | 'picker' | 'drop') {
  if (route === 'demo') {
    await page.getByRole('button', { name: 'Open Demo' }).click();
    return;
  }
  const contents = JSON.stringify(minimalDocument());
  if (route === 'picker') {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open File' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'replacement.mosa',
      mimeType: 'application/json',
      buffer: Buffer.from(contents),
    });
  } else {
    const transfer = await page.evaluateHandle((json) => {
      const data = new DataTransfer();
      data.items.add(new File([json], 'replacement.mosa', { type: 'application/json' }));
      return data;
    }, contents);
    try {
      await page.getByRole('main').dispatchEvent('drop', { dataTransfer: transfer });
    } finally {
      await transfer.dispose();
    }
  }
}

for (const route of ['demo', 'picker', 'drop'] as const) {
  test(`cancels and accepts a dirty ${route} replacement offline`, async ({ page }, testInfo) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open Demo' })).toBeVisible();
    const requests: string[] = [];
    page.context().on('request', (request) => requests.push(request.url()));
    await page.context().setOffline(true);
    await replace(page, 'demo');
    const note = page.getByRole('textbox', { name: 'Document note' });
    await note.fill('Keep my edits');
    const cell = page.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
    await cell.fill('5000');
    await page.getByRole('checkbox', { name: 'Show revenue chart' }).uncheck();
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Source' }).click();
    const source = page.getByRole('tabpanel', { name: 'Source' });
    const before = await source.innerText();
    const pendingCancel = page.waitForEvent('dialog');
    const cancelling = replace(page, route);
    const cancelDialog = await pendingCancel;
    expect(cancelDialog.type()).toBe('confirm');
    expect(cancelDialog.message()).toBe(
      'This document has unsaved changes. Replace it and discard those changes?',
    );
    await cancelDialog.dismiss();
    await cancelling;
    await expect(page.getByRole('status')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Source' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(await source.innerText()).toBe(before);
    await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Preview' }).click();
    await expect(note).toHaveValue('Keep my edits');
    await expect(cell).toHaveValue('5000');
    await expect(page.getByRole('checkbox', { name: 'Show revenue chart' })).not.toBeChecked();
    await expect(page.getByRole('img', { name: 'Revenue by month' })).toHaveCount(0);

    if (route === 'demo') {
      await page.setViewportSize({ width: 320, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
      await page.screenshot({ path: testInfo.outputPath('unsaved-320.png'), fullPage: true });
    }
    const pendingAccept = page.waitForEvent('dialog');
    const accepting = replace(page, route);
    const acceptDialog = await pendingAccept;
    await acceptDialog.accept();
    await accepting;
    await expect(page.getByText('Unsaved changes', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Preview' })).toBeFocused();
    if (route === 'demo') {
      await expect(note).toHaveValue('First report');
      await expect(cell).toHaveValue('1200');
      await expect(page.getByRole('checkbox', { name: 'Show revenue chart' })).toBeChecked();
    } else {
      await expect(page.getByRole('heading', { name: 'Minimal document' })).toBeVisible();
      await expect(page.getByText('replacement.mosa', { exact: true })).toBeVisible();
    }
    expect(requests).toEqual([]);
  });
}
