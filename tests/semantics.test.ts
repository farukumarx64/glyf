import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { MosaicErrorCode } from '../src/core/errors.ts';
import { parseMosaic } from '../src/core/parse.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { minimalDocument, nodeSamples, typedDocument } from './fixtures.ts';

const sample = typedDocument.datasets.values;
const childPath = '/root/children/0';
function withChild(node: unknown) {
  return { ...typedDocument, root: { ...minimalDocument().root, children: [node] } };
}
function withDataset(columns: unknown[], rows: unknown[]) {
  return { ...minimalDocument(), datasets: { values: { columns, rows } } };
}
function failsInMemory(value: unknown, code: MosaicErrorCode, path: string) {
  const result = validateMosaic(value);
  expect(result).toMatchObject({
    ok: false,
    errors: [{ code, path, message: expect.any(String) }],
  });
  return result;
}
// JSON documents must give the same diagnostic through either public entry point.
function fails(value: unknown, code: MosaicErrorCode, path: string) {
  const source = JSON.stringify(value);
  const direct = failsInMemory(value, code, path);
  expect(parseMosaic(source)).toStrictEqual(direct);
  expect(JSON.stringify(value)).toBe(source);
}
function chartDocument(rows: unknown[], children: unknown[] = [nodeSamples.chart]) {
  return { ...withDataset(sample.columns, rows), root: { ...minimalDocument().root, children } };
}

describe('full validation entry points', () => {
  it('accepts every component together and returns the original typed document', () => {
    const copy = structuredClone(typedDocument);
    const result = validateMosaic(typedDocument);
    expect(result.ok && result.document).toBe(typedDocument);
    expect(typedDocument).toEqual(copy);
    expect(parseMosaic(JSON.stringify(typedDocument))).toEqual(result);
  });

  it('parses the unmodified demo and accepts an optional BOM', () => {
    const source = readFileSync(new URL('../examples/mosaic-demo.mosa', import.meta.url), 'utf8');
    expect(parseMosaic('\uFEFF' + source)).toEqual({ ok: true, document: JSON.parse(source) });
  });

  it('uses the same semantic diagnostics from text and direct objects', () => {
    const doc = withChild({ ...nodeSamples.chart, x: 'missing' });
    expect(parseMosaic(JSON.stringify(doc))).toEqual(validateMosaic(doc));
    fails(doc, 'INVALID_DATASET', childPath + '/x');
  });

  it('preserves source and schema diagnostics before semantics', () => {
    expect(parseMosaic('{"mosaic":"0.1.0","mosaic":"0.2.0"}')).toMatchObject({
      ok: false,
      errors: [{ code: 'INVALID_JSON', path: '/mosaic' }],
    });
    const source = JSON.stringify({ ...minimalDocument(), state: { n: 123 } }).replace(
      '123',
      '1e400',
    );
    expect(parseMosaic(source)).toMatchObject({
      ok: false,
      errors: [{ code: 'SCHEMA_ERROR', path: '/state/n' }],
    });
    fails(
      { ...minimalDocument(), root: { type: 'canvas', id: 'unknown' } },
      'SCHEMA_ERROR',
      '/root',
    );
  });

  it('accepts plain records from other realms and rejects non-JSON containers and values', () => {
    const external: unknown = runInNewContext('JSON.parse(source)', {
      source: JSON.stringify(typedDocument),
    });
    expect(validateMosaic(external).ok).toBe(true);
    for (const state of [new Date(), new Map(), Object.create({ visible: true })]) {
      failsInMemory({ ...minimalDocument(), state }, 'SCHEMA_ERROR', '/state');
    }
    failsInMemory({ ...minimalDocument(), theme: undefined }, 'SCHEMA_ERROR', '/theme');
  });
});

describe('roots and identity', () => {
  it.each([nodeSamples.column, nodeSamples.row, nodeSamples.grid, nodeSamples.card])(
    'permits a $type root',
    (root) => {
      expect(validateMosaic({ ...minimalDocument(), root }).ok).toBe(true);
    },
  );
  it.each(
    Object.values(nodeSamples).filter(
      (node) => !['column', 'row', 'grid', 'card'].includes(node.type),
    ),
  )('rejects a $type root', (root) => {
    fails({ ...typedDocument, root }, 'INVALID_ROOT', '/root/type');
  });
  it('finds a duplicate ID across separate branches, including a hidden when', () => {
    const doc = {
      ...typedDocument,
      state: { visible: false },
      root: {
        ...minimalDocument().root,
        children: [
          { ...nodeSamples.card, children: [nodeSamples.divider] },
          { ...nodeSamples.when, children: [nodeSamples.divider] },
        ],
      },
    };
    fails(doc, 'DUPLICATE_ID', '/root/children/1/children/0/id');
    fails(withChild({ ...nodeSamples.divider, id: 'root' }), 'DUPLICATE_ID', childPath + '/id');
  });
  it('keeps document, node, dataset and row identity scopes separate', () => {
    const doc = {
      ...minimalDocument(),
      id: 'root',
      datasets: { first: sample, second: sample },
      root: {
        ...minimalDocument().root,
        children: [{ ...nodeSamples.text, id: 'first', text: 'constructor prototype __proto__' }],
      },
    };
    expect(validateMosaic(doc).ok).toBe(true);
  });
});

describe('dataset declarations and cells', () => {
  it.each(['constructor', 'prototype'])(
    'rejects reserved declaration %s even when unused',
    (key) => {
      fails(
        { ...minimalDocument(), datasets: { [key]: sample } },
        'INVALID_DATASET',
        '/datasets/' + key,
      );
      fails(
        withDataset([{ ...sample.columns[0], key }], []),
        'INVALID_DATASET',
        '/datasets/values/columns/0/key',
      );
      fails({ ...minimalDocument(), state: { [key]: null } }, 'INVALID_BINDING', '/state/' + key);
    },
  );
  it('reports schema-forbidden names at the structural stage', () => {
    for (const key of ['__proto__', 'id']) {
      fails(
        withDataset([{ ...sample.columns[0], key }], []),
        'SCHEMA_ERROR',
        '/datasets/values/columns/0/key',
      );
    }
    fails(
      { ...minimalDocument(), datasets: { ['__proto__']: sample } },
      'SCHEMA_ERROR',
      '/datasets/__proto__',
    );
    fails(
      { ...minimalDocument(), state: { ['__proto__']: null } },
      'SCHEMA_ERROR',
      '/state/__proto__',
    );
  });
  it('locates reserved references that already fail the schema identifier pattern', () => {
    for (const [node, field] of [
      [nodeSamples.chart, 'dataset'],
      [nodeSamples.chart, 'x'],
      [nodeSamples.chart, 'y'],
      [nodeSamples.table, 'dataset'],
      [nodeSamples.when, 'bind'],
      [nodeSamples.toggle, 'bind'],
      [nodeSamples.input, 'bind'],
      [nodeSamples.stateValue, 'bind'],
    ] as const) {
      fails(withChild({ ...node, [field]: '__proto__' }), 'SCHEMA_ERROR', childPath + '/' + field);
    }
  });
  it('rejects duplicate columns and row IDs at the later occurrence', () => {
    fails(
      withDataset([sample.columns[0], sample.columns[0]], []),
      'INVALID_DATASET',
      '/datasets/values/columns/1/key',
    );
    fails(
      withDataset(sample.columns, [sample.rows[0], sample.rows[0]]),
      'DUPLICATE_ID',
      '/datasets/values/rows/1/id',
    );
  });
  it('requires exactly the declared cells and escapes extra property names', () => {
    fails(
      withDataset(sample.columns, [{ id: 'a', label: null, active: false }]),
      'INVALID_DATASET',
      '/datasets/values/rows/0/amount',
    );
    fails(
      withDataset(sample.columns, [{ ...sample.rows[0], 'extra~/': null }]),
      'INVALID_DATASET',
      '/datasets/values/rows/0/extra~0~1',
    );
  });
  it.each([
    ['amount', '12'],
    ['amount', false],
    ['label', 42],
    ['label', false],
    ['active', 0],
    ['active', 'false'],
  ] as const)('rejects a non-matching %s cell without coercion', (key, value) => {
    fails(
      withDataset(sample.columns, [{ ...sample.rows[0], [key]: value }]),
      'INVALID_DATASET',
      '/datasets/values/rows/0/' + key,
    );
  });
  it('accepts null in each column kind, finite negative numbers, empty labels and false', () => {
    expect(
      validateMosaic(
        withDataset(sample.columns, [
          { id: 'a', label: null, amount: null, active: null },
          { id: 'b', label: '', amount: -1.25, active: false },
        ]),
      ).ok,
    ).toBe(true);
  });
  it.each([NaN, Infinity, -Infinity])(
    'rejects non-finite value %s before cell type checks',
    (value) => {
      failsInMemory(
        withDataset(sample.columns, [{ ...sample.rows[0], amount: value }]),
        'SCHEMA_ERROR',
        '/datasets/values/rows/0/amount',
      );
    },
  );
  it('resolves permitted names like toString only from actual dataset and row declarations', () => {
    const columns = [{ key: 'toString', kind: 'number', label: 'Value' }];
    fails(
      withDataset(columns, [{ id: 'r' }]),
      'INVALID_DATASET',
      '/datasets/values/rows/0/toString',
    );
    const doc = {
      ...withChild({ ...nodeSamples.chart, dataset: 'toString', x: 'toString', y: 'toString' }),
      datasets: { toString: { columns, rows: [{ id: 'r', toString: 0 }] } },
    };
    expect(validateMosaic(doc).ok).toBe(true);
  });
});

describe('state bindings', () => {
  it.each([nodeSamples.toggle, nodeSamples.input, nodeSamples.when, nodeSamples.stateValue])(
    'requires a declared key for $type',
    (node) => {
      for (const bind of ['missing', 'toString', 'constructor', 'prototype']) {
        fails(withChild({ ...node, bind }), 'INVALID_BINDING', childPath + '/bind');
      }
      const doc = { ...minimalDocument(), root: withChild(node).root };
      fails(doc, 'INVALID_BINDING', childPath + '/bind');
    },
  );
  it.each([
    [nodeSamples.toggle, 'false'],
    [nodeSamples.toggle, 0],
    [nodeSamples.toggle, null],
    [nodeSamples.input, 1],
    [nodeSamples.input, false],
    [nodeSamples.input, null],
    [{ ...nodeSamples.input, kind: 'number' }, '12'],
    [{ ...nodeSamples.input, kind: 'number' }, false],
    [{ ...nodeSamples.input, kind: 'number' }, null],
  ] as const)('rejects an incompatible control binding', (node, value) => {
    const doc = { ...withChild({ ...node, bind: 'v' }), state: { v: value } };
    fails(doc, 'INVALID_BINDING', childPath + '/bind');
  });
  it('accepts typed falsy values and scalar comparisons without coercion', () => {
    const children = [
      { ...nodeSamples.toggle, bind: 'flag' },
      { ...nodeSamples.input, bind: 'toString' },
      { ...nodeSamples.input, id: 'num', kind: 'number', bind: 'n' },
      { ...nodeSamples.stateValue, bind: 'empty' },
      { ...nodeSamples.when, bind: 'empty', equals: null },
      { ...nodeSamples.when, id: 'differentTypes', bind: 'n', equals: '0' },
    ];
    expect(
      validateMosaic({
        ...typedDocument,
        state: { flag: false, toString: '', n: 0, empty: null },
        root: { ...minimalDocument().root, children },
      }).ok,
    ).toBe(true);
  });
  it('validates a bad binding even under a false condition', () => {
    const doc = {
      ...withChild({ ...nodeSamples.when, children: [{ ...nodeSamples.toggle, bind: 'absent' }] }),
      state: { visible: false },
    };
    fails(doc, 'INVALID_BINDING', childPath + '/children/0/bind');
  });

  it.each([null, false, 0, '0'])(
    'allows display and conditional bindings to the declared scalar %j',
    (value) => {
      const doc = {
        ...minimalDocument(),
        state: { v: value },
        root: {
          ...minimalDocument().root,
          children: [
            { ...nodeSamples.stateValue, bind: 'v' },
            { ...nodeSamples.when, bind: 'v', equals: value },
          ],
        },
      };
      expect(parseMosaic(JSON.stringify(doc))).toStrictEqual({ ok: true, document: doc });
    },
  );
});

describe('dataset references and chart axes', () => {
  it.each([nodeSamples.chart, nodeSamples.table])(
    'resolves the $type dataset by an own declaration',
    (node) => {
      for (const dataset of ['missing', 'toString', 'constructor', 'prototype']) {
        fails(withChild({ ...node, dataset }), 'INVALID_DATASET', childPath + '/dataset');
      }
      fails(
        { ...minimalDocument(), root: withChild(node).root },
        'INVALID_DATASET',
        childPath + '/dataset',
      );
    },
  );
  it.each(['x', 'y'] as const)(
    'requires a declared, permitted %s column in the selected dataset',
    (axis) => {
      for (const key of ['missing', 'id', 'constructor', 'prototype', 'toString', 'active']) {
        fails(
          withChild({ ...nodeSamples.chart, [axis]: key }),
          'INVALID_DATASET',
          childPath + '/' + axis,
        );
      }
      const doc = withChild({ ...nodeSamples.chart, [axis]: 'other' });
      fails(
        {
          ...doc,
          datasets: {
            ...doc.datasets,
            other: { columns: [{ key: 'other', kind: 'number', label: 'Other' }], rows: [] },
          },
        },
        'INVALID_DATASET',
        childPath + '/' + axis,
      );
    },
  );
  it('requires numeric y and allows the same numeric column on both axes for either chart kind', () => {
    fails(withChild({ ...nodeSamples.chart, y: 'label' }), 'INVALID_DATASET', childPath + '/y');
    for (const kind of ['bar', 'line']) {
      expect(
        validateMosaic(withChild({ ...nodeSamples.chart, kind, x: 'amount', y: 'amount' })).ok,
      ).toBe(true);
    }
    expect(validateMosaic(chartDocument([])).ok).toBe(true);
  });
});

describe('aggregate cells and chart point budgets', () => {
  it('reports declared schema budgets through the full validator at and above their ceilings', () => {
    const numbers = (count: number) => Array.from({ length: count }, (_, i) => i);
    const columns = (count: number) =>
      numbers(count).map((i) => ({ key: 'c' + i, kind: 'number', label: 'C' }));
    const rows = (count: number) => numbers(count).map((i) => ({ id: 'r' + i, c0: null }));
    const datasets = (count: number) =>
      Object.fromEntries(numbers(count).map((i) => ['d' + i, { columns: columns(1), rows: [] }]));
    const state = (count: number) => Object.fromEntries(numbers(count).map((i) => ['s' + i, null]));
    for (const doc of [
      withDataset(columns(30), []),
      withDataset(columns(1), rows(1000)),
      { ...minimalDocument(), datasets: datasets(20) },
      { ...minimalDocument(), state: state(100) },
      withChild({ ...nodeSamples.markdown, text: '😀'.repeat(20000) }),
    ])
      expect(validateMosaic(doc).ok).toBe(true);
    fails(withDataset(columns(31), []), 'RESOURCE_LIMIT', '/datasets/values/columns');
    fails(withDataset(columns(1), rows(1001)), 'RESOURCE_LIMIT', '/datasets/values/rows');
    fails({ ...minimalDocument(), datasets: datasets(21) }, 'RESOURCE_LIMIT', '/datasets');
    fails({ ...minimalDocument(), state: state(101) }, 'RESOURCE_LIMIT', '/state');
    fails(
      withChild({ ...nodeSamples.markdown, text: '😀'.repeat(20001) }),
      'RESOURCE_LIMIT',
      childPath + '/text',
    );
  });
  it('accepts exactly 20,000 null cells across datasets and rejects cell 20,001', () => {
    const columns = Array.from({ length: 10 }, (_, i) => ({
      key: 'c' + i,
      kind: 'number',
      label: 'C',
    }));
    const cells = Object.fromEntries(columns.map(({ key }) => [key, null]));
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: 'r' + i, ...cells }));
    const datasets = { a: { columns, rows }, b: { columns, rows } };
    expect(validateMosaic({ ...minimalDocument(), datasets }).ok).toBe(true);
    fails(
      {
        ...minimalDocument(),
        datasets: { ...datasets, c: { columns: [columns[0]], rows: [{ id: 'r', c0: null }] } },
      },
      'RESOURCE_LIMIT',
      '/datasets/c/rows',
    );
  });
  it('counts zero and empty labels, skips either null axis, and enforces point 501 per chart', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: 'r' + i,
      label: '',
      amount: 0,
      active: false,
    }));
    const nullRows = [
      { id: 'xNull', label: null, amount: 1, active: true },
      { id: 'yNull', label: '', amount: null, active: true },
    ];
    const data = [...rows, ...nullRows];
    expect(
      validateMosaic(
        chartDocument(data, [
          nodeSamples.chart,
          { ...nodeSamples.chart, id: 'second', kind: 'line' },
        ]),
      ).ok,
    ).toBe(true);
    // Selecting the numeric column for both axes makes xNull plottable in the second chart.
    fails(
      chartDocument(data, [nodeSamples.chart, { ...nodeSamples.chart, id: 'second', x: 'amount' }]),
      'RESOURCE_LIMIT',
      '/root/children/1',
    );
    const over = [...data, { id: 'extra', label: '', amount: -1, active: false }];
    fails(
      {
        ...chartDocument(over, [{ ...nodeSamples.when, children: [nodeSamples.chart] }]),
        state: { visible: false },
      },
      'RESOURCE_LIMIT',
      childPath + '/children/0',
    );
    expect(validateMosaic(chartDocument(over, [nodeSamples.table])).ok).toBe(true);
  });

  it('checks chart points per dataset and checks edited rows again on the next validation', () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      id: 'r' + i,
      label: '',
      amount: i === 500 ? null : i,
      active: false,
    }));
    const otherRows = structuredClone(rows);
    const doc = {
      ...chartDocument(rows, [
        nodeSamples.chart,
        { ...nodeSamples.chart, id: 'otherChart', dataset: 'other' },
      ]),
      datasets: {
        values: { columns: sample.columns, rows },
        other: { columns: sample.columns, rows: otherRows },
      },
    };
    expect(validateMosaic(doc).ok).toBe(true);
    otherRows[500]!.amount = 0;
    fails(doc, 'RESOURCE_LIMIT', '/root/children/1');
    otherRows[500]!.amount = null;
    expect(validateMosaic(doc).ok).toBe(true);
  });
});
