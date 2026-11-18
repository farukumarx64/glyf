import { describe, expect, it, vi } from 'vitest';
import { parseMosaic } from '../src/core/parse.ts';
import { serializeMosaic } from '../src/core/serialize.ts';
import { createDocumentStore } from '../src/core/store.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { minimalDocument, nodeSamples, typedDocument } from './fixtures.ts';

const reservedNames = ['__proto__', 'prototype', 'constructor'];

describe('prototype-key attacks in source files', () => {
  it.each(reservedNames)(
    'rejects escaped %s declarations and references after decoding',
    (name) => {
      const data = typedDocument.datasets.values;
      const declarationCases = [
        {
          value: { ...typedDocument, state: { [name]: null } },
          code: 'INVALID_BINDING',
          path: '/state/' + name,
        },
        {
          value: { ...typedDocument, datasets: { [name]: data } },
          code: 'INVALID_DATASET',
          path: '/datasets/' + name,
        },
        {
          value: {
            ...typedDocument,
            datasets: {
              values: { columns: [{ key: name, label: 'Reserved', kind: 'number' }], rows: [] },
            },
          },
          code: 'INVALID_DATASET',
          path: '/datasets/values/columns/0/key',
        },
      ];
      const references = [
        [nodeSamples.table, 'dataset'],
        [nodeSamples.chart, 'dataset'],
        [nodeSamples.chart, 'x'],
        [nodeSamples.chart, 'y'],
        [nodeSamples.when, 'bind'],
        [nodeSamples.toggle, 'bind'],
        [nodeSamples.input, 'bind'],
        [nodeSamples.stateValue, 'bind'],
      ] as const;
      const referenceCases = references.map(([node, field]) => ({
        value: {
          ...typedDocument,
          root: { ...typedDocument.root, children: [{ ...node, [field]: name }] },
        },
        code: field === 'bind' ? 'INVALID_BINDING' : 'INVALID_DATASET',
        path: '/root/children/0/' + field,
      }));
      const prototype = Object.getOwnPropertyDescriptors(Object.prototype);
      for (const { value, code, path } of [...declarationCases, ...referenceCases]) {
        const source = JSON.stringify(value).replaceAll(
          JSON.stringify(name),
          '"\\u' + name.charCodeAt(0).toString(16).padStart(4, '0') + name.slice(1) + '"',
        );
        expect(parseMosaic(source)).toMatchObject({
          ok: false,
          errors: [{ code: name === '__proto__' ? 'SCHEMA_ERROR' : code, path }],
        });
        expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(prototype);
      }
    },
  );

  it.each([
    '{"__proto__":{"mosaicAuditPolluted":true}}',
    '{"constructor":{"prototype":{"mosaicAuditPolluted":true}}}',
  ])('rejects nested pollution payload %s without altering prototypes', (payload) => {
    const doc = minimalDocument();
    const source = JSON.stringify({ ...doc, state: 'PAYLOAD' }).replace('"PAYLOAD"', payload);
    const before = Object.getOwnPropertyDescriptors(Object.prototype);
    expect(parseMosaic(source).ok).toBe(false);
    const value: unknown = JSON.parse(source);
    expect(validateMosaic(value).ok).toBe(false);
    expect(JSON.stringify(value)).toBe(source);
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(before);
    expect(Reflect.get({}, 'mosaicAuditPolluted')).toBeUndefined();
  });

  it.each(['toString', 'valueOf', 'hasOwnProperty', 'toJSON'])(
    'preserves legal shadow name %s through edits and export',
    (name) => {
      const doc = minimalDocument();
      const value = {
        ...doc,
        state: { [name]: 'Before' },
        datasets: {
          [name]: {
            columns: [{ key: name, label: 'Value', kind: 'string', editable: true }],
            rows: [{ id: 'constructor', [name]: 'Before' }],
          },
        },
        root: {
          ...doc.root,
          children: [
            { ...nodeSamples.table, id: 'prototype', dataset: name },
            { ...nodeSamples.input, bind: name },
          ],
        },
      };
      const opened = parseMosaic(JSON.stringify(value));
      if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
      const store = createDocumentStore(opened);
      expect(store.updateCell('prototype', 'constructor', name, 'After').ok).toBe(true);
      expect(store.updateState(name, 'After').ok).toBe(true);
      const exported = serializeMosaic(store.getSnapshot());
      expect(parseMosaic(exported)).toEqual({ ok: true, document: store.getSnapshot() });
      expect(store.getRow(name, 'constructor')?.[name]).toBe('After');
      expect(store.getSnapshot().state?.[name]).toBe('After');
      expect(value.state[name]).toBe('Before');
      expect(value.datasets[name]!.rows[0]![name]).toBe('Before');
    },
  );
});

describe('failed edits are atomic', () => {
  it.each([false, true])('preserves snapshots, exports and dirty=%s for hostile edits', (dirty) => {
    const opened = validateMosaic(typedDocument);
    if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
    const store = createDocumentStore(opened);
    if (dirty) store.updateState('note', 'Saved valid edit');
    const snapshot = store.getSnapshot();
    const exported = serializeMosaic(snapshot);
    const notify = vi.fn();
    store.subscribe(notify);
    const hook = vi.fn(() => {
      throw new Error('Must not coerce or serialize rejected values');
    });
    const hostile = { valueOf: hook, toString: hook, toJSON: hook };
    for (const name of reservedNames) {
      expect(store.updateCell(name, 'first', 'amount', 1).ok).toBe(false);
      expect(store.updateCell('table', name, 'amount', 1).ok).toBe(false);
      expect(store.updateCell('table', 'first', name, hostile).ok).toBe(false);
      expect(store.updateState(name, hostile).ok).toBe(false);
    }
    for (const value of [hostile, NaN, Infinity, -Infinity, undefined, [], 1n]) {
      expect(store.updateCell('table', 'first', 'amount', value).ok).toBe(false);
      expect(store.updateState('count', value).ok).toBe(false);
    }
    expect(hook).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toBe(snapshot);
    expect(store.isDirty()).toBe(dirty);
    expect(serializeMosaic(store.getSnapshot())).toBe(exported);
    expect(typedDocument.state.note).toBe('Hello');
  });
});
