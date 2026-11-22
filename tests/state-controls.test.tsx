// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import demoSource from '../examples/glyf-demo.glyf?raw';
import { DocumentView } from '../src/app/DocumentView.tsx';
import { parseGlyf } from '../src/core/parse.ts';
import { serializeGlyf } from '../src/core/serialize.ts';
import { createDocumentStore } from '../src/core/store.ts';
import type { GlyfDocument } from '../src/core/types.ts';
import { validateGlyf } from '../src/core/validate.ts';
import { nodeSamples, typedDocument } from './fixtures.ts';

afterEach(cleanup);

function open(input: unknown) {
  const opened = validateGlyf(input);
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const store = createDocumentStore(opened);
  render(<DocumentView store={store} fileName="controls.glyf" />);
  return store;
}

function numericDocument(): GlyfDocument {
  return {
    ...typedDocument,
    root: {
      ...typedDocument.root,
      children: [
        { ...nodeSamples.input, kind: 'number', bind: 'count', label: 'Count' },
        { ...nodeSamples.input, id: 'other', kind: 'number', bind: 'count', label: 'Other count' },
        { ...nodeSamples.stateValue, bind: 'count', prefix: 'Count: ', suffix: '' },
        { ...nodeSamples.when, bind: 'count', equals: 0, children: [nodeSamples.text] },
        nodeSamples.table,
        nodeSamples.toggle,
      ],
    },
  };
}

describe('state controls', () => {
  it('updates the demo immediately, composes with cell edits, and round-trips without mutating the original', () => {
    const parsed = parseGlyf(demoSource);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
    const original = parsed.document;
    const before = serializeGlyf(original);
    const store = open(original);
    const note = screen.getByRole('textbox', { name: 'Document note' });
    const toggle = screen.getByRole('checkbox', { name: 'Show revenue chart' });
    expect(note).toHaveProperty('disabled', false);
    expect(toggle).toHaveProperty('disabled', false);
    fireEvent.change(note, { target: { value: 'Updated report\nNext line' } });
    expect(
      screen.getByText('Current note: Updated report\nNext line', { collapseWhitespace: false }),
    ).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle).toHaveProperty('checked', false);
    expect(store.getSnapshot().state?.showChart).toBe(false);
    expect(screen.queryByRole('img', { name: 'Revenue by month' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' }), {
      target: { value: '5000' },
    });
    fireEvent.click(toggle);
    const chart = screen.getByRole('img', { name: 'Revenue by month' });
    expect(document.getElementById(chart.getAttribute('aria-describedby')!)?.textContent).toContain(
      'Values range from 1800 to 5000',
    );
    expect(serializeGlyf(original)).toBe(before);
    expect(parseGlyf(serializeGlyf(store.getSnapshot()))).toEqual({
      ok: true,
      document: store.getSnapshot(),
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    expect(JSON.parse(screen.getByRole('tabpanel').textContent!)).toEqual(store.getSnapshot());
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByRole('textbox', { name: 'Document note' })).toHaveProperty(
      'value',
      'Updated report\nNext line',
    );
    expect(screen.getByRole('checkbox', { name: 'Show revenue chart' })).toHaveProperty(
      'checked',
      true,
    );
  });

  it('preserves text, empty strings and focus while updating repeated bindings and strict string conditions', () => {
    const doc: GlyfDocument = {
      ...typedDocument,
      root: {
        ...typedDocument.root,
        children: [
          { ...nodeSamples.input, label: '  ' },
          { ...nodeSamples.input, id: 'other', label: 'Other note' },
          nodeSamples.stateValue,
          { ...nodeSamples.when, bind: 'note', equals: '', children: [nodeSamples.text] },
        ],
      },
    };
    const store = open(doc);
    const input = screen.getByRole('textbox', { name: 'note' });
    input.focus();
    for (const value of ['<b>literal</b>\n  Next', '', '0']) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByRole('textbox', { name: 'note' })).toBe(input);
      expect(document.activeElement).toBe(input);
      expect(store.getSnapshot().state?.note).toBe(value);
      expect(screen.getByRole('textbox', { name: 'Other note' })).toHaveProperty('value', value);
      expect(screen.getByText('(' + value + ')', { collapseWhitespace: false })).toBeTruthy();
      expect(screen.queryByText('Plain text') !== null).toBe(value === '');
      expect(document.querySelector('b')).toBeNull();
    }
    const snapshot = store.getSnapshot();
    expect(snapshot.root).toBe(doc.root);
    expect(snapshot.datasets).toBe(doc.datasets);
    expect(doc.state?.note).toBe('Hello');
  });

  it('synchronizes toggles and boolean displays, and mounts conditional children in file order', () => {
    const store = open({
      ...typedDocument,
      root: {
        ...typedDocument.root,
        children: [
          { ...nodeSamples.toggle, label: '' },
          { ...nodeSamples.toggle, id: 'other', label: 'Other visible' },
          { ...nodeSamples.stateValue, bind: 'visible', prefix: 'Visible: ', suffix: '' },
          { ...nodeSamples.when, children: [nodeSamples.heading, nodeSamples.input] },
        ],
      },
    });
    const toggle = screen.getByRole('checkbox', { name: 'visible' });
    fireEvent.click(toggle);
    expect(screen.getByText('Visible: false')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Heading' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Other visible' })).toHaveProperty(
      'checked',
      false,
    );
    act(() => {
      store.updateState('note', 'Updated while hidden');
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Other visible' }));
    expect(toggle).toHaveProperty('checked', true);
    expect(screen.getByText('Visible: true')).toBeTruthy();
    const heading = screen.getByRole('heading', { name: 'Heading' });
    const input = screen.getByRole('textbox', { name: 'Note' });
    expect(input).toHaveProperty('value', 'Updated while hidden');
    expect(heading.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(['', ' ', '-', '.', '1e', '1e-', '1e9999', 'NaN', 'Infinity', '0x10', '1,500', '12abc'])(
    'keeps invalid numeric draft %j local through blur and restores the last valid state on Escape',
    (value) => {
      const store = open(numericDocument());
      const input = screen.getByRole('textbox', { name: 'Count' });
      fireEvent.change(input, { target: { value: '0' } });
      const before = store.getSnapshot();
      const listener = vi.fn();
      store.subscribe(listener);
      fireEvent.change(input, { target: { value } });
      expect(input).toHaveProperty('value', value);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      const error = screen.getByRole('alert');
      expect(error.id).toBe(input.getAttribute('aria-describedby'));
      expect(error.textContent).toBe('Enter a finite decimal number.');
      expect(store.getSnapshot()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Other count' })).toHaveProperty('value', '0');
      expect(screen.getByText('Count: 0')).toBeTruthy();
      expect(screen.getByText('Plain text')).toBeTruthy();
      fireEvent.blur(input);
      expect(input).toHaveProperty('value', value);
      fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
      expect(input).toHaveProperty('value', value);
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(input).toHaveProperty('value', '0');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(input.getAttribute('aria-invalid')).toBeNull();
      expect(input.getAttribute('aria-describedby')).toBeNull();
      expect(store.getSnapshot()).toBe(before);
    },
  );

  it('publishes complete finite numbers immediately, keeps draft spelling until blur, and recovers from errors', () => {
    const store = open(numericDocument());
    const input = screen.getByRole('textbox', { name: 'Count' });
    for (const [text, value] of [
      ['1.', 1],
      ['1.5', 1.5],
      ['-.5', -0.5],
      [' 2e3 ', 2000],
      ['+4', 4],
      ['0', 0],
    ] as const) {
      fireEvent.change(input, { target: { value: text } });
      expect(input).toHaveProperty('value', text);
      expect(store.getSnapshot().state?.count).toBe(value);
      expect(screen.getByText('Count: ' + value)).toBeTruthy();
      expect(screen.queryByText('Plain text') !== null).toBe(value === 0);
      fireEvent.blur(input);
      expect(input).toHaveProperty('value', String(value));
    }
    fireEvent.change(input, { target: { value: '1e-' } });
    fireEvent.change(input, { target: { value: '1e-2' } });
    expect(store.getSnapshot().state?.count).toBe(0.01);
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveProperty('value', '0.01');
  });

  it('preserves invalid drafts across unrelated edits and follows a changed value from the same binding', () => {
    const store = open(numericDocument());
    const input = screen.getByRole('textbox', { name: 'Count' });
    fireEvent.change(input, { target: { value: '-' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Visible' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount, row first' }), {
      target: { value: '7' },
    });
    expect(input).toHaveProperty('value', '-');
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(store.getSnapshot().state?.count).toBe(3);
    const other = screen.getByRole('textbox', { name: 'Other count' });
    fireEvent.change(other, { target: { value: '20' } });
    expect(input).toHaveProperty('value', '20');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(input, { target: { value: '1e' } });
    act(() => {
      store.updateState('count', 42);
    });
    expect(input).toHaveProperty('value', '42');
    expect(other).toHaveProperty('value', '42');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows only committed values in Source and restores them on returning to Preview', () => {
    const store = open(numericDocument());
    const input = screen.getByRole('textbox', { name: 'Count' });
    fireEvent.change(input, { target: { value: '1e999' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    const source = screen.getByRole('tabpanel').textContent!;
    expect(JSON.parse(source)).toEqual(store.getSnapshot());
    expect(source).not.toContain('1e999');
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByRole('textbox', { name: 'Count' })).toHaveProperty('value', '3');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
