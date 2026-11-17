// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import demoSource from '../examples/mosaic-demo.mosa?raw';
import { DocumentView } from '../src/app/DocumentView.tsx';
import { parseMosaic } from '../src/core/parse.ts';
import { serializeMosaic } from '../src/core/serialize.ts';
import { createDocumentStore } from '../src/core/store.ts';
import type { MosaicDocument } from '../src/core/types.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { minimalDocument, nodeSamples, typedDocument } from './fixtures.ts';

afterEach(cleanup);

function open(input: unknown) {
  const opened = validateMosaic(input);
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const store = createDocumentStore(opened);
  render(<DocumentView store={store} fileName="edit.mosa" />);
  return store;
}

function demo(): MosaicDocument {
  const parsed = parseMosaic(demoSource);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  return parsed.document;
}

describe('cell editing', () => {
  it('commits a demo edit immediately to the table, chart and Source, preserving the original', () => {
    const original = demo();
    const before = serializeMosaic(original);
    const store = open(original);
    const input = screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
    const chart = screen.getByRole('img', { name: 'Revenue by month' });
    const bar = chart.querySelector('rect')!;
    const height = bar.getAttribute('height');
    fireEvent.change(input, { target: { value: '5000' } });
    expect(store.getRow('revenue', 'jan')?.amount).toBe(5000);
    expect(input).toHaveProperty('value', '5000');
    expect(bar.getAttribute('height')).not.toBe(height);
    expect(document.getElementById(chart.getAttribute('aria-describedby')!)?.textContent).toContain(
      'Values range from 1800 to 5000',
    );
    expect(serializeMosaic(original)).toBe(before);
    expect(parseMosaic(serializeMosaic(store.getSnapshot()))).toEqual({
      ok: true,
      document: store.getSnapshot(),
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    expect(screen.getByRole('tabpanel').textContent).toBe(
      JSON.stringify(store.getSnapshot(), null, 2) + '\n',
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' })).toHaveProperty(
      'value',
      '5000',
    );
  });

  it.each(['', ' ', '-', '.', '1e', '1e9999', 'NaN', 'Infinity', '0x10', '1,500', '12abc'])(
    'keeps invalid numeric draft %j out of the document and restores the last value on Escape',
    (text) => {
      const store = open(demo());
      const input = screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
      const before = store.getSnapshot();
      const chart = screen.getByRole('img').innerHTML;
      fireEvent.change(input, { target: { value: text } });
      expect(input).toHaveProperty('value', text);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(screen.getByRole('alert').id).toBe(input.getAttribute('aria-describedby'));
      expect(store.getSnapshot()).toBe(before);
      expect(screen.getByRole('img').innerHTML).toBe(chart);
      fireEvent.blur(input);
      expect(input).toHaveProperty('value', text);
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(input).toHaveProperty('value', '1200');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(store.getSnapshot()).toBe(before);
    },
  );

  it('keeps valid numeric draft spelling while typing, normalizes on blur and recovers from errors', () => {
    const store = open(demo());
    const input = screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
    for (const [text, value] of [
      ['1.', 1],
      ['1.5', 1.5],
      ['-.5', -0.5],
      [' 2e3 ', 2000],
      ['0', 0],
    ] as const) {
      fireEvent.change(input, { target: { value: text } });
      expect(input).toHaveProperty('value', text);
      expect(store.getRow('revenue', 'jan')?.amount).toBe(value);
      fireEvent.blur(input);
      expect(input).toHaveProperty('value', String(value));
    }
    fireEvent.change(input, { target: { value: 'broken' } });
    fireEvent.change(input, { target: { value: '1500' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(store.getRow('revenue', 'jan')?.amount).toBe(1500);
  });

  it.each(
    [undefined, false, true].flatMap((table) =>
      [undefined, false, true].map((column) => ({ table, column })),
    ),
  )('requires both permissions with table=$table and column=$column', ({ table, column }) => {
    const doc = minimalDocument();
    open({
      ...doc,
      datasets: {
        values: {
          columns: [
            {
              key: 'amount',
              label: 'Amount',
              kind: 'number',
              ...(column === undefined ? {} : { editable: column }),
            },
          ],
          rows: [{ id: 'r', amount: 12 }],
        },
      },
      root: {
        ...doc.root,
        children: [
          {
            id: 'table',
            type: 'table',
            dataset: 'values',
            ...(table === undefined ? {} : { editable: table }),
          },
        ],
      },
    });
    const editable = table === true && column === true;
    expect(screen.queryByRole('textbox') !== null).toBe(editable);
    if (!editable) expect(screen.getByRole('cell').textContent).toBe('12');
  });

  it('distinguishes empty strings from null and edits boolean and multiline string cells', () => {
    const data = typedDocument.datasets.values;
    const store = open({
      ...typedDocument,
      datasets: {
        values: { ...data, columns: data.columns.map((column) => ({ ...column, editable: true })) },
      },
    });
    const text = screen.getByRole('textbox', { name: 'Label, row first' });
    fireEvent.change(text, { target: { value: '<b>literal</b>\n  next' } });
    expect(store.getRow('values', 'first')?.label).toBe('<b>literal</b>\n  next');
    fireEvent.change(text, { target: { value: '' } });
    expect(store.getRow('values', 'first')?.label).toBe('');
    expect(text.getAttribute('placeholder')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Set Label, row first to no value' }));
    expect(store.getRow('values', 'first')?.label).toBeNull();
    expect(text.getAttribute('placeholder')).toBe('No value');
    const boolean = screen.getByRole('combobox', { name: 'Active, row first' });
    for (const [option, saved] of [
      ['false', false],
      ['', null],
      ['true', true],
    ] as const) {
      fireEvent.change(boolean, { target: { value: option } });
      expect(store.getRow('values', 'first')?.active).toBe(saved);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Set Amount, row first to no value' }));
    expect(store.getRow('values', 'first')?.amount).toBeNull();
  });

  it('shares committed values across two tables and both chart kinds while preserving unrelated drafts', () => {
    const doc = typedDocument;
    const store = open({
      ...doc,
      root: {
        ...doc.root,
        children: [
          nodeSamples.table,
          { ...nodeSamples.table, id: 'other' },
          { ...nodeSamples.table, id: 'readOnly', editable: false },
          nodeSamples.chart,
          { ...nodeSamples.chart, kind: 'line', id: 'line' },
        ],
      },
    });
    const tables = screen.getAllByRole('table', { name: 'values' });
    const first = within(tables[0]!).getByRole('textbox', { name: 'Amount, row first' });
    const other = within(tables[1]!).getByRole('textbox', { name: 'Amount, row first' });
    fireEvent.change(first, { target: { value: '-' } });
    act(() => {
      store.updateCell('table', 'second', 'amount', 7);
    });
    expect(first).toHaveProperty('value', '-');
    fireEvent.change(other, { target: { value: '20' } });
    expect(first).toHaveProperty('value', '20');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(tables[2]!).getByRole('cell', { name: '20' })).toBeTruthy();
    for (const chart of screen.getAllByRole('img')) {
      expect(
        document.getElementById(chart.getAttribute('aria-describedby')!)?.textContent,
      ).toContain('Values range from 7 to 20');
    }
  });

  it('rejects an edit adding a 501st chart point, then permits it after a point is cleared', () => {
    const data = typedDocument.datasets.values;
    const doc = minimalDocument();
    const store = open({
      ...doc,
      datasets: {
        values: {
          ...data,
          rows: Array.from({ length: 501 }, (_, i) => ({
            id: 'r' + i,
            label: 'Row ' + i,
            amount: i < 500 ? i : null,
            active: false,
          })),
        },
      },
      root: { ...doc.root, children: [nodeSamples.table, nodeSamples.chart] },
    });
    for (let i = 0; i < 5; i++)
      fireEvent.click(screen.getByRole('button', { name: /Show .* more row/ }));
    const last = screen.getByRole('textbox', { name: 'Amount, row r500' });
    fireEvent.change(last, { target: { value: '1' } });
    expect(store.getRow('values', 'r500')?.amount).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('exceeds the limit of 500');
    expect(screen.getByRole('img').querySelectorAll('rect')).toHaveLength(500);
    fireEvent.click(screen.getByRole('button', { name: 'Set Amount, row r0 to no value' }));
    fireEvent.change(last, { target: { value: '2' } });
    expect(store.getRow('values', 'r500')?.amount).toBe(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('img').querySelectorAll('rect')).toHaveLength(500);
  });
});
