import { checkChartPointLimit, isCellValue } from './dataset-rules.ts';
import type { ParseResult } from './errors.ts';
import { appendJsonPointer, jsonPointer, type JsonPointer } from './json-pointer.ts';
import { MOSAIC_LIMITS } from './limits.ts';
import { stateBindingType } from './semantics.ts';
import type { MosaicNode, TableNode } from './types.ts';

interface DatasetIndex {
  rowPositions: Map<string, number>;
  columnPositions: Map<string, number>;
  // Edited column -> other axis -> first chart using that pair, in file order.
  chartAxes: Map<string, Map<string, JsonPointer>>;
}

function indexChartAxis(index: DatasetIndex, column: string, other: string, path: JsonPointer) {
  let partners = index.chartAxes.get(column);
  if (!partners) {
    partners = new Map();
    index.chartAxes.set(column, partners);
  }
  if (!partners.has(other)) partners.set(other, path);
}

function invalidEdit(path: JsonPointer, message: string): ParseResult {
  return { ok: false, errors: [{ code: 'INVALID_DATASET', path, message }] };
}

function invalidState(key: string, message: string): ParseResult {
  return {
    ok: false,
    errors: [{ code: 'INVALID_BINDING', path: jsonPointer('state', key), message }],
  };
}

/** Open one store per successful parse or validation. Its snapshots use the readonly core model. */
export function createDocumentStore(opened: Extract<ParseResult, { ok: true }>) {
  let document = opened.document;
  const datasets = new Map<string, DatasetIndex>();
  const tables = new Map<string, { node: TableNode; path: JsonPointer }>();
  const stateTypes = new Map<string, 'boolean' | 'string' | 'number'>();
  const listeners = new Set<() => void>();

  for (const [name, dataset] of Object.entries(document.datasets ?? {})) {
    datasets.set(name, {
      rowPositions: new Map(dataset.rows.map((row, i) => [row.id, i])),
      columnPositions: new Map(dataset.columns.map((column, i) => [column.key, i])),
      chartAxes: new Map(),
    });
  }

  function indexNode(node: MosaicNode, path: JsonPointer) {
    if ('bind' in node) {
      const type = stateBindingType(node);
      if (type) stateTypes.set(node.bind, type);
    }
    if (node.type === 'table') tables.set(node.id, { node, path });
    if (node.type === 'chart') {
      // Row count is fixed. A smaller dataset can never exceed the chart limit.
      if (document.datasets![node.dataset]!.rows.length > MOSAIC_LIMITS.chartPoints) {
        const index = datasets.get(node.dataset)!;
        indexChartAxis(index, node.x, node.y, path);
        indexChartAxis(index, node.y, node.x, path);
      }
    }
    if ('children' in node) {
      const childrenPath = appendJsonPointer(path, 'children');
      for (const [i, child] of node.children.entries()) {
        indexNode(child, appendJsonPointer(childrenPath, i));
      }
    }
  }
  indexNode(document.root, jsonPointer('root'));

  function getDataset(name: string) {
    return datasets.has(name) ? document.datasets![name] : undefined;
  }

  function getRow(name: string, rowId: string) {
    const position = datasets.get(name)?.rowPositions.get(rowId);
    return position === undefined ? undefined : document.datasets![name]!.rows[position];
  }

  function updateState(key: string, value: unknown): ParseResult {
    const state = document.state;
    if (!state || !Object.hasOwn(state, key)) {
      return invalidState(key, `State key "${key}" is not declared.`);
    }
    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'boolean' &&
      !(typeof value === 'number' && Number.isFinite(value))
    ) {
      return invalidState(key, 'State values must be strings, booleans, finite numbers, or null.');
    }
    const expected = stateTypes.get(key);
    if (expected && typeof value !== expected) {
      return invalidState(
        key,
        `State key "${key}" requires a ${expected} value for its control bindings.`,
      );
    }
    if (Object.is(state[key], value)) return { ok: true, document };

    document = { ...document, state: { ...state, [key]: value } };
    const result = { ok: true, document } as const;
    for (const notify of listeners) notify();
    return result;
  }

  function updateCell(
    tableId: string,
    rowId: string,
    columnKey: string,
    value: unknown,
  ): ParseResult {
    const table = tables.get(tableId);
    if (!table) return invalidEdit(jsonPointer('root'), `Table "${tableId}" does not exist.`);
    if (!Object.hasOwn(table.node, 'editable') || table.node.editable !== true) {
      return invalidEdit(table.path, `Table "${tableId}" is read-only.`);
    }

    const name = table.node.dataset;
    const dataset = document.datasets![name]!;
    const index = datasets.get(name)!;
    const position = index.rowPositions.get(rowId);
    if (position === undefined) {
      return invalidEdit(
        jsonPointer('datasets', name, 'rows'),
        `Dataset "${name}" has no row "${rowId}".`,
      );
    }
    const cellPath = jsonPointer('datasets', name, 'rows', position, columnKey);
    if (columnKey === 'id') return invalidEdit(cellPath, 'A stable row ID cannot be edited.');
    const columnIndex = index.columnPositions.get(columnKey);
    if (columnIndex === undefined) {
      return invalidEdit(
        jsonPointer('datasets', name, 'columns'),
        `Dataset "${name}" has no column "${columnKey}".`,
      );
    }
    const column = dataset.columns[columnIndex]!;
    if (!Object.hasOwn(column, 'editable') || column.editable !== true) {
      return invalidEdit(
        jsonPointer('datasets', name, 'columns', columnIndex),
        `Column "${columnKey}" is read-only.`,
      );
    }
    if (!isCellValue(value, column.kind)) {
      const expected = column.kind === 'number' ? 'finite number' : column.kind;
      return invalidEdit(cellPath, `Column "${columnKey}" requires a ${expected} value or null.`);
    }

    const row = dataset.rows[position]!;
    if (Object.is(row[columnKey], value)) return { ok: true, document };
    const nextRow = { ...row, [columnKey]: value };
    const rows = dataset.rows.slice();
    rows[position] = nextRow;
    // Only filling a null can add a point. Check each affected axis pair once
    // before publishing, including charts inside hidden conditional content.
    const partners = index.chartAxes.get(columnKey);
    if (row[columnKey] === null && partners) {
      for (const [other, path] of partners) {
        if (nextRow[other] === null) continue;
        const error = checkChartPointLimit(rows, columnKey, other, path);
        if (error) return { ok: false, errors: [error] };
      }
    }

    document = { ...document, datasets: { ...document.datasets, [name]: { ...dataset, rows } } };
    const result = { ok: true, document } as const;
    for (const notify of listeners) notify();
    return result;
  }

  return {
    getSnapshot: () => document,
    getDataset,
    getRow,
    updateCell,
    updateState,
    subscribe(notify: () => void) {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
  };
}

export type DocumentStore = ReturnType<typeof createDocumentStore>;
