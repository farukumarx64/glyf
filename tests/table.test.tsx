// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentView } from '../src/app/DocumentView.tsx';
import { createDocumentStore } from '../src/core/store.ts';
import type { Dataset, TableNode } from '../src/core/types.ts';
import { validateGlyf } from '../src/core/validate.ts';
import { minimalDocument, nodeSamples } from './fixtures.ts';

afterEach(cleanup);

function openTable(data: Dataset, tables: TableNode[] = [nodeSamples.table]) {
  const doc = minimalDocument();
  const result = validateGlyf({
    ...doc,
    datasets: { values: data },
    root: { ...doc.root, children: tables },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  const store = createDocumentStore(result);
  render(<DocumentView store={store} fileName="table.glyf" />);
  return store;
}

function numberedRows(count: number, editable = false): Dataset {
  return {
    columns: [{ key: 'value', label: 'Value', kind: 'number', editable }],
    rows: Array.from({ length: count }, (_, i) => ({ id: 'row-' + i, value: i + 1 })),
  };
}

describe('table rendering', () => {
  it('uses a caption, scoped headers and declared column and file order for typed cells', () => {
    openTable({
      columns: [
        { key: 'label', label: 'Item', kind: 'string' },
        { key: 'active', label: '  ', kind: 'boolean' },
        { key: 'amount', label: 'Total', kind: 'number' },
      ],
      rows: [
        { id: 'z', amount: 0, active: false, label: '<b>003</b>\n  next' },
        { id: 'a', amount: -2.75, active: true, label: '' },
        { id: 'm', amount: null, active: null, label: null },
      ],
    });
    const table = screen.getByRole<HTMLTableElement>('table', { name: 'values' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual(['Item', 'active', 'Total']);
    expect(headers.every((header) => header.getAttribute('scope') === 'col')).toBe(true);
    const content = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) =>
        within(row)
          .getAllByRole('cell')
          .map((cell) => cell.textContent),
      );
    expect(content).toEqual([
      ['<b>003</b>\n  next', 'false', '0'],
      ['', 'true', '-2.75'],
      ['—', '—', '—'],
    ]);
    expect(within(table).getAllByRole('cell', { name: 'No value' })).toHaveLength(3);
    expect(table.querySelector('b, input, button')).toBeNull();
  });

  it.each([0, 1, 99, 100])('renders every one of %i rows immediately', (count) => {
    openTable(numberedRows(count));
    const table = screen.getByRole<HTMLTableElement>('table', { name: 'values' });
    expect(table.querySelectorAll('tbody > tr')).toHaveLength(count);
    expect(within(table).getByRole('columnheader', { name: 'Value' })).toBeTruthy();
    expect(screen.queryByText('No rows') !== null).toBe(count === 0);
    expect(screen.queryByRole('button', { name: /more rows?/ })).toBeNull();
  });

  it('mounts just the requested batches up to the 1,000-row limit in file order', () => {
    openTable(numberedRows(1000));
    const table = screen.getByRole<HTMLTableElement>('table', { name: 'values' });
    const rows = table.querySelector('tbody')!.children;
    const first = rows[0];
    expect(table.getAttribute('aria-rowcount')).toBe('1001');
    expect(table.querySelector('thead tr')?.getAttribute('aria-rowindex')).toBe('1');
    for (let visible = 100; visible <= 1000; visible += 100) {
      expect(rows.length).toBe(visible);
      expect(rows[0]).toBe(first);
      expect(rows[visible - 1]?.getAttribute('aria-rowindex')).toBe(String(visible + 1));
      expect(screen.getByRole('status').textContent).toBe(`Showing ${visible} of 1000 rows`);
      if (visible < 1000) {
        const more = screen.getByRole('button', { name: 'Show 100 more rows' });
        expect(more.getAttribute('aria-controls')).toBe(table.id);
        fireEvent.click(more);
        expect(document.activeElement).toBe(rows[visible]);
      }
    }
    expect(Array.from(rows, (row) => row.textContent)).toEqual(
      Array.from({ length: 1000 }, (_, i) => String(i + 1)),
    );
    expect(screen.queryByRole('button', { name: /more rows?/ })).toBeNull();
  });

  it('expands each view independently and reads edits to visible and unrevealed rows', () => {
    const store = openTable(numberedRows(101, true), [
      nodeSamples.table,
      { ...nodeSamples.table, id: 'secondTable' },
    ]);
    const [first, second] = screen.getAllByRole<HTMLTableElement>('table', { name: 'values' });
    const firstRows = first!.querySelector('tbody')!.children;
    const secondRows = second!.querySelector('tbody')!.children;
    const more = screen.getAllByRole('button', { name: 'Show 1 more row' });
    fireEvent.click(more[0]!);
    expect(firstRows.length).toBe(101);
    expect(secondRows.length).toBe(100);
    const last = firstRows[100];
    act(() => {
      store.updateCell('table', 'row-0', 'value', -7);
      store.updateCell('table', 'row-100', 'value', 0);
    });
    expect(within(firstRows[0] as HTMLElement).getByRole('textbox')).toHaveProperty('value', '-7');
    expect(within(secondRows[0] as HTMLElement).getByRole('textbox')).toHaveProperty('value', '-7');
    expect(firstRows[100]).toBe(last);
    expect(within(last as HTMLElement).getByRole('textbox')).toHaveProperty('value', '0');
    fireEvent.click(more[1]!);
    expect(within(secondRows[100] as HTMLElement).getByRole('textbox')).toHaveProperty(
      'value',
      '0',
    );
  });
});
