import { describe, expect, it, vi } from 'vitest';
import demoSource from '../examples/mosaic-demo.mosa?raw';
import { parseMosaic } from '../src/core/parse.ts';
import { serializeMosaic } from '../src/core/serialize.ts';
import { createDocumentStore } from '../src/core/store.ts';
import type { Dataset, MosaicNode } from '../src/core/types.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { minimalDocument, nodeSamples, typedDocument } from './fixtures.ts';

function storeFor(input: unknown) {
  const opened = validateMosaic(input);
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  return createDocumentStore(opened);
}

function withTables(dataset: Dataset, ...children: MosaicNode[]) {
  return {
    ...minimalDocument(),
    datasets: { values: dataset },
    root: { ...minimalDocument().root, children: [nodeSamples.table, ...children] },
  };
}

describe('document store', () => {
  it('edits January revenue by stable ID and preserves the demo and file order', () => {
    const opened = parseMosaic(demoSource);
    if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
    const original = opened.document;
    const store = createDocumentStore(opened);
    const revenue = original.datasets!.revenue!;
    for (const object of [original, original.datasets, revenue, revenue.rows, ...revenue.rows]) {
      Object.freeze(object);
    }
    expect(store.getSnapshot()).toBe(original);
    expect(store.getDataset('revenue')).toBe(revenue);
    expect(store.getRow('revenue', 'jan')).toBe(revenue.rows[0]);

    const edited = store.updateCell('revenueTable', 'jan', 'amount', 1500);
    if (!edited.ok) throw new Error(JSON.stringify(edited.errors));
    expect(edited.document).toBe(store.getSnapshot());
    expect(store.getRow('revenue', 'jan')?.amount).toBe(1500);
    expect(revenue.rows[0]?.amount).toBe(1200);
    const current = store.getDataset('revenue')!;
    expect(current.rows.map((row) => row.id)).toEqual(['jan', 'feb', 'mar']);
    expect(current.columns).toBe(revenue.columns);
    expect(current.rows[1]).toBe(revenue.rows[1]);
    expect(current.rows[2]).toBe(revenue.rows[2]);
    expect(edited.document.root).toBe(original.root);
    expect(edited.document.state).toBe(original.state);
    expect(parseMosaic(serializeMosaic(edited.document))).toEqual(edited);
  });

  it('scopes row IDs to their dataset and keeps earlier snapshots across successive edits', () => {
    const data = typedDocument.datasets.values;
    const store = storeFor({ ...typedDocument, datasets: { values: data, other: data } });
    const first = store.getSnapshot();
    const other = store.getDataset('other');
    expect(store.updateCell('table', 'second', 'amount', 0).ok).toBe(true);
    const second = store.getSnapshot();
    expect(store.updateCell('table', 'first', 'amount', 8).ok).toBe(true);
    expect(store.getDataset('values')?.rows.map((row) => [row.id, row.amount])).toEqual([
      ['first', 8],
      ['second', 0],
    ]);
    expect(second.datasets!.values!.rows.map((row) => row.amount)).toEqual([-2.5, 0]);
    expect(first.datasets!.values!.rows.map((row) => row.amount)).toEqual([-2.5, null]);
    expect(store.getDataset('other')).toBe(other);
    expect(store.getRow('other', 'second')?.amount).toBeNull();
  });

  it('returns undefined for missing lookups, including documents without datasets', () => {
    const empty = storeFor(minimalDocument());
    expect(empty.getSnapshot()).not.toHaveProperty('datasets');
    expect(empty.getDataset('values')).toBeUndefined();
    expect(empty.getRow('values', 'first')).toBeUndefined();
    const store = storeFor(typedDocument);
    for (const name of ['unknown', 'constructor', 'toString', '__proto__']) {
      expect(store.getDataset(name)).toBeUndefined();
      expect(store.getRow(name, 'first')).toBeUndefined();
      expect(store.getRow('values', name)).toBeUndefined();
    }
  });

  it('resolves legal names that shadow object properties, including on null-prototype records', () => {
    const doc = minimalDocument();
    const datasets = Object.assign(Object.create(null), {
      toString: {
        columns: [{ key: 'hasOwnProperty', label: 'Flag', kind: 'boolean', editable: true }],
        rows: [Object.assign(Object.create(null), { id: 'constructor', hasOwnProperty: false })],
      },
    });
    const store = storeFor({
      ...doc,
      datasets,
      root: {
        ...doc.root,
        children: [{ ...nodeSamples.table, id: 'prototype', dataset: 'toString' }],
      },
    });
    expect(store.updateCell('prototype', 'constructor', 'hasOwnProperty', true).ok).toBe(true);
    expect(store.getRow('toString', 'constructor')?.hasOwnProperty).toBe(true);
    expect(store.getDataset('constructor')).toBeUndefined();
  });

  it('publishes one complete snapshot per change and lets readers unsubscribe', () => {
    const store = storeFor(typedDocument);
    const observe = vi.fn(() => store.getRow('values', 'second')?.amount);
    const stop = store.subscribe(observe);
    expect(store.updateCell('table', 'second', 'amount', 100).ok).toBe(true);
    const snapshot = store.getSnapshot();
    expect(observe).toHaveReturnedWith(100);
    expect(store.updateCell('table', 'second', 'amount', 100)).toEqual({
      ok: true,
      document: snapshot,
    });
    expect(store.updateCell('table', 'second', 'amount', '100').ok).toBe(false);
    expect(store.getSnapshot()).toBe(snapshot);
    expect(observe).toHaveBeenCalledTimes(1);
    stop();
    expect(store.updateCell('table', 'second', 'amount', null).ok).toBe(true);
    expect(observe).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing', 'first', 'amount', '/root'],
    ['toString', 'first', 'amount', '/root'],
    ['table', 'unknown', 'amount', '/datasets/values/rows'],
    ['table', 'first', 'missing', '/datasets/values/columns'],
    ['table', 'first', '__proto__', '/datasets/values/columns'],
    ['table', 'second', 'id', '/datasets/values/rows/1/id'],
    ['table', 'first', 'label', '/datasets/values/columns/0'],
    ['table', 'first', 'active', '/datasets/values/columns/2'],
  ])('rejects the edit at %s / %s / %s', (tableId, rowId, key, path) => {
    const store = storeFor(typedDocument);
    const original = store.getSnapshot();
    const result = store.updateCell(tableId, rowId, key, null);
    expect(result).toMatchObject({ ok: false, errors: [{ code: 'INVALID_DATASET', path }] });
    expect(store.getSnapshot()).toBe(original);
  });

  it('requires the originating table to grant edits even if another table can write', () => {
    const readOnly = { id: 'readOnly', type: 'table', dataset: 'values' } as const;
    const store = storeFor(
      withTables(typedDocument.datasets.values, readOnly, {
        ...readOnly,
        id: 'explicit',
        editable: false,
      }),
    );
    const before = store.getSnapshot();
    for (const [i, id] of ['readOnly', 'explicit'].entries()) {
      expect(store.updateCell(id, 'first', 'amount', -2.5)).toMatchObject({
        ok: false,
        errors: [{ code: 'INVALID_DATASET', path: '/root/children/' + (i + 1) }],
      });
    }
    expect(store.getSnapshot()).toBe(before);
    expect(store.updateCell('table', 'first', 'amount', 20).ok).toBe(true);
  });

  it('accepts the declared scalar kind and null without coercion', () => {
    const data = typedDocument.datasets.values;
    const store = storeFor(
      withTables({
        ...data,
        columns: data.columns.map((column) => ({ ...column, editable: true })),
      }),
    );
    for (const [key, valid, invalid] of [
      ['label', ['', '003', null], [3, false]],
      ['amount', [0, -7.5, null], ['0', false, NaN, Infinity, -Infinity, undefined, {}]],
      ['active', [false, true, null], ['false', 1]],
    ] as const) {
      for (const value of valid) {
        expect(store.updateCell('table', 'second', key, value).ok).toBe(true);
        expect(store.getRow('values', 'second')?.[key]).toBe(value);
      }
      const before = store.getSnapshot();
      for (const value of invalid) {
        expect(store.updateCell('table', 'second', key, value)).toMatchObject({
          ok: false,
          errors: [{ code: 'INVALID_DATASET', path: '/datasets/values/rows/1/' + key }],
        });
        expect(store.getSnapshot()).toBe(before);
      }
    }
  });

  it('checks every affected chart before publishing, including hidden charts and shared axes', () => {
    const chart = { ...nodeSamples.chart, x: 'label', y: 'amount' };
    const sameAxis = { ...chart, id: 'sameAxis', x: 'amount' };
    const data = typedDocument.datasets.values;
    const rows = Array.from({ length: 502 }, (_, i) => ({
      id: 'r' + i,
      amount: i < 500 ? i : null,
      label: i === 0 ? null : '',
      active: false,
    }));
    const doc = withTables(
      {
        ...data,
        rows,
        columns: data.columns.map((c) => ({ ...c, editable: true })),
      },
      chart,
      { ...chart, id: 'secondChart' },
      { ...nodeSamples.when, children: [sameAxis] },
    );
    const store = storeFor({ ...doc, state: { visible: false } });
    const before = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    // 499 label/amount pairs but 500 amount/amount pairs. Filling amount
    // would fit the visible chart and overflow the hidden one.
    expect(store.updateCell('table', 'r500', 'amount', 0)).toMatchObject({
      ok: false,
      errors: [{ code: 'RESOURCE_LIMIT', path: '/root/children/3/children/0' }],
    });
    expect(store.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
    expect(store.isDirty()).toBe(false);
    // Free a point, fill another up to exactly 500, then change the other axis.
    expect(store.updateCell('table', 'r1', 'amount', null).ok).toBe(true);
    expect(store.updateCell('table', 'r500', 'amount', 0).ok).toBe(true);
    expect(store.updateCell('table', 'r0', 'label', '').ok).toBe(true);
    expect(store.updateCell('table', 'r0', 'amount', -1).ok).toBe(true);
    expect(validateMosaic(store.getSnapshot()).ok).toBe(true);
    expect(listener).toHaveBeenCalledTimes(4);
    const edited = store.getSnapshot();
    const exported = serializeMosaic(edited);
    expect(store.updateCell('table', 'r501', 'amount', 2).ok).toBe(false);
    expect(store.getSnapshot()).toBe(edited);
    expect(store.isDirty()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(4);
    expect(serializeMosaic(store.getSnapshot())).toBe(exported);
  });

  it('counts a new x value only if y is present and permits exactly 500 points', () => {
    const data = typedDocument.datasets.values;
    const store = storeFor(
      withTables(
        {
          columns: data.columns.map((c) => ({ ...c, editable: true })),
          rows: Array.from({ length: 502 }, (_, i) => ({
            id: 'r' + i,
            label: i < 500 ? '' : null,
            amount: i === 501 ? null : 0,
            active: false,
          })),
        },
        nodeSamples.chart,
      ),
    );
    expect(store.updateCell('table', 'r501', 'label', '').ok).toBe(true);
    expect(store.updateCell('table', 'r500', 'label', '')).toMatchObject({
      ok: false,
      errors: [{ code: 'RESOURCE_LIMIT', path: '/root/children/1' }],
    });
    expect(store.updateCell('table', 'r0', 'label', null).ok).toBe(true);
    expect(store.updateCell('table', 'r500', 'label', '').ok).toBe(true);
    expect(validateMosaic(store.getSnapshot()).ok).toBe(true);
  });
});

describe('state updates', () => {
  it('updates the demo note and preserves the original document and earlier snapshots', () => {
    const opened = parseMosaic(demoSource);
    if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
    const original = opened.document;
    Object.freeze(original.state);
    Object.freeze(original);
    const store = createDocumentStore(opened);

    const result = store.updateState('note', 'Updated report');
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.document).toBe(store.getSnapshot());
    expect(result.document).not.toBe(original);
    expect(result.document.state).not.toBe(original.state);
    expect(result.document.state).toEqual({ showChart: true, note: 'Updated report' });
    expect(original.state!.note).toBe('First report');
    expect(result.document.datasets).toBe(original.datasets);
    expect(result.document.root).toBe(original.root);
    expect(result.document.meta).toBe(original.meta);
    expect(result.document.theme).toBe(original.theme);
    expect(store.updateState('showChart', false).ok).toBe(true);
    expect(result.document.state!.showChart).toBe(true);
    expect(store.getSnapshot().state).toEqual({ showChart: false, note: 'Updated report' });
    expect(parseMosaic(serializeMosaic(store.getSnapshot()))).toEqual({
      ok: true,
      document: store.getSnapshot(),
    });
  });

  it('enforces all control binding types, including shared bindings inside a hidden condition', () => {
    const doc = minimalDocument();
    const store = storeFor({
      ...doc,
      state: { visible: false, count: 1, note: 'Initial' },
      root: {
        ...doc.root,
        children: [
          nodeSamples.toggle,
          nodeSamples.input,
          {
            ...nodeSamples.when,
            children: [
              { ...nodeSamples.input, id: 'number', kind: 'number', bind: 'count' },
              { ...nodeSamples.input, id: 'secondNumber', kind: 'number', bind: 'count' },
              { ...nodeSamples.toggle, id: 'hiddenToggle' },
            ],
          },
        ],
      },
    });
    for (const [key, invalidValues, valid] of [
      ['visible', [0, 'false', null], true],
      ['note', [0, false, null], ''],
      ['count', ['2', false, null], -2.5],
    ] as const) {
      const before = store.getSnapshot();
      for (const value of invalidValues) {
        expect(store.updateState(key, value)).toMatchObject({
          ok: false,
          errors: [{ code: 'INVALID_BINDING', path: '/state/' + key }],
        });
        expect(store.getSnapshot()).toBe(before);
      }
      expect(store.updateState(key, valid).ok).toBe(true);
      expect(store.getSnapshot().state![key]).toBe(valid);
      expect(validateMosaic(store.getSnapshot()).ok).toBe(true);
    }
  });

  it('allows scalar type changes for unbound keys and keys used only by when or stateValue', () => {
    const doc = minimalDocument();
    const store = storeFor({
      ...doc,
      state: { value: null, unused: 0 },
      root: {
        ...doc.root,
        children: [
          { ...nodeSamples.when, bind: 'value', equals: 'show' },
          { ...nodeSamples.stateValue, bind: 'value' },
        ],
      },
    });
    for (const key of ['value', 'unused']) {
      for (const value of ['show', '', false, true, -0, Number.MIN_VALUE, Number.MAX_VALUE, null]) {
        expect(store.updateState(key, value).ok).toBe(true);
        expect(store.getSnapshot().state![key]).toBe(value);
        expect(validateMosaic(store.getSnapshot()).ok).toBe(true);
      }
    }
  });

  it.each([NaN, Infinity, -Infinity, undefined, {}, [], 1n, Symbol('value'), () => 0])(
    'rejects the invalid state value %s without publishing a snapshot',
    (value) => {
      const store = storeFor(typedDocument);
      const original = store.getSnapshot();
      const notify = vi.fn();
      store.subscribe(notify);
      expect(store.updateState('empty', value)).toMatchObject({
        ok: false,
        errors: [{ code: 'INVALID_BINDING', path: '/state/empty' }],
      });
      expect(store.getSnapshot()).toBe(original);
      expect(notify).not.toHaveBeenCalled();
    },
  );

  it('rejects non-finite numbers for numeric control bindings', () => {
    const doc = minimalDocument();
    const store = storeFor({
      ...doc,
      state: { count: 0 },
      root: { ...doc.root, children: [{ ...nodeSamples.input, kind: 'number', bind: 'count' }] },
    });
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(store.updateState('count', value)).toMatchObject({
        ok: false,
        errors: [{ code: 'INVALID_BINDING', path: '/state/count' }],
      });
      expect(store.getSnapshot().state!.count).toBe(0);
    }
  });

  it('rejects missing and reserved keys with escaped JSON Pointers, including absent state', () => {
    for (const document of [
      minimalDocument(),
      { ...minimalDocument(), state: {} },
      typedDocument,
    ]) {
      const store = storeFor(document);
      for (const key of [
        'missing',
        '__proto__',
        'constructor',
        'prototype',
        'toString',
        'bad/~key',
      ]) {
        const path = '/state/' + key.replaceAll('~', '~0').replaceAll('/', '~1');
        expect(store.updateState(key, 1)).toMatchObject({
          ok: false,
          errors: [{ code: 'INVALID_BINDING', path }],
        });
        expect(store.getSnapshot()).toBe(document);
      }
    }
  });

  it('uses own keys for null-prototype state maps and legal names that shadow object properties', () => {
    const state = Object.assign(Object.create(null), { toString: 1, hasOwnProperty: false });
    const store = storeFor({ ...minimalDocument(), state });
    expect(store.updateState('toString', 'Literal').ok).toBe(true);
    expect(store.updateState('hasOwnProperty', true).ok).toBe(true);
    expect(store.getSnapshot().state).toEqual({ toString: 'Literal', hasOwnProperty: true });
    expect(state.toString).toBe(1);
    expect(state.hasOwnProperty).toBe(false);
    expect(validateMosaic(store.getSnapshot()).ok).toBe(true);
  });

  it('publishes once per actual change, supports unsubscribe and composes state and cell edits', () => {
    const store = storeFor(typedDocument);
    const notify = vi.fn(() => store.getSnapshot());
    const unsubscribe = store.subscribe(notify);
    const original = store.getSnapshot();
    expect(store.updateState('note', 'Hello')).toEqual({ ok: true, document: original });
    expect(store.updateState('note', null).ok).toBe(false);
    expect(notify).not.toHaveBeenCalled();
    const changed = store.updateState('note', 'Updated');
    expect(notify).toHaveReturnedWith(store.getSnapshot());
    expect(notify).toHaveBeenCalledTimes(1);
    expect(changed).toEqual({ ok: true, document: store.getSnapshot() });
    expect(store.updateCell('table', 'first', 'amount', 10).ok).toBe(true);
    expect(store.updateState('visible', false).ok).toBe(true);
    expect(store.getSnapshot().state).toEqual({
      ...original.state,
      note: 'Updated',
      visible: false,
    });
    expect(store.getRow('values', 'first')?.amount).toBe(10);
    expect(notify).toHaveBeenCalledTimes(3);
    unsubscribe();
    expect(store.updateState('note', 'Final').ok).toBe(true);
    expect(notify).toHaveBeenCalledTimes(3);
  });
});
