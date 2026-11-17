import { checkChartPointLimit, isCellValue } from './dataset-rules.ts';
import type { MosaicError, MosaicErrorCode, ParseResult } from './errors.ts';
import { appendJsonPointer, jsonPointer, type JsonPointer } from './json-pointer.ts';
import { checkResourceLimit, MOSAIC_LIMITS } from './limits.ts';
import type { StructuralDocument } from './schema.ts';
import type {
  ChartNode,
  ColumnKind,
  Dataset,
  DatasetRow,
  InputNode,
  MosaicDocument,
  MosaicNode,
  StateValueNode,
  ToggleNode,
  WhenNode,
} from './types.ts';

const reservedNames = new Set(['__proto__', 'prototype', 'constructor']);

interface IndexedDataset {
  rows: readonly DatasetRow[];
  kinds: ReadonlyMap<string, ColumnKind>;
  // Several charts can use the same axes. Counts are valid only for this validation call.
  checkedAxes: Set<string>;
}

function issue(code: MosaicErrorCode, path: JsonPointer, message: string): MosaicError {
  return { code, path, message };
}

function hasLayoutRoot(document: StructuralDocument): document is MosaicDocument {
  const type = document.root.type;
  return type === 'column' || type === 'row' || type === 'grid' || type === 'card';
}

function checkRows(
  name: string,
  rows: readonly DatasetRow[],
  kinds: ReadonlyMap<string, ColumnKind>,
) {
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (ids.has(row.id)) {
      return issue(
        'DUPLICATE_ID',
        jsonPointer('datasets', name, 'rows', index, 'id'),
        `Row ID "${row.id}" occurs more than once in dataset "${name}".`,
      );
    }
    ids.add(row.id);
    for (const [key, kind] of kinds) {
      if (!Object.hasOwn(row, key)) {
        return issue(
          'INVALID_DATASET',
          jsonPointer('datasets', name, 'rows', index, key),
          `Missing cell for column "${key}". Use null for a missing value.`,
        );
      }
      const cell = row[key];
      if (!isCellValue(cell, kind)) {
        return issue(
          'INVALID_DATASET',
          jsonPointer('datasets', name, 'rows', index, key),
          `Column "${key}" requires a ${kind} value or null.`,
        );
      }
    }
    for (const key of Object.keys(row)) {
      if (key !== 'id' && !kinds.has(key)) {
        return issue(
          'INVALID_DATASET',
          jsonPointer('datasets', name, 'rows', index, key),
          `Row contains undeclared column "${key}".`,
        );
      }
    }
  }
}

function indexDatasets(
  datasets: Readonly<Record<string, Dataset>> | undefined,
  index: Map<string, IndexedDataset>,
) {
  const entries = Object.entries(datasets ?? {});
  const datasetLimit = checkResourceLimit('datasets', entries.length, jsonPointer('datasets'));
  if (datasetLimit) return datasetLimit;
  let cells = 0;
  for (const [name, { columns, rows }] of entries) {
    if (reservedNames.has(name)) {
      return issue(
        'INVALID_DATASET',
        jsonPointer('datasets', name),
        `Dataset name "${name}" is reserved.`,
      );
    }
    cells += rows.length * columns.length;
    const cellLimit = checkResourceLimit(
      'totalCells',
      cells,
      jsonPointer('datasets', name, 'rows'),
    );
    if (cellLimit) return cellLimit;

    const kinds = new Map<string, ColumnKind>();
    for (const [i, { key, kind }] of columns.entries()) {
      if (reservedNames.has(key)) {
        return issue(
          'INVALID_DATASET',
          jsonPointer('datasets', name, 'columns', i, 'key'),
          `Column key "${key}" is reserved.`,
        );
      }
      if (kinds.has(key)) {
        return issue(
          'INVALID_DATASET',
          jsonPointer('datasets', name, 'columns', i, 'key'),
          `Column key "${key}" occurs more than once in dataset "${name}".`,
        );
      }
      kinds.set(key, kind);
    }
    const rowError = checkRows(name, rows, kinds);
    if (rowError) return rowError;
    index.set(name, { rows, kinds, checkedAxes: new Set() });
  }
}

/** Shared by import validation and store updates, including hidden controls. */
export function stateBindingType(node: WhenNode | StateValueNode | ToggleNode | InputNode) {
  if (node.type === 'toggle') return 'boolean';
  if (node.type === 'input') return node.kind === 'text' ? 'string' : 'number';
}

function checkBinding(
  node: WhenNode | StateValueNode | ToggleNode | InputNode,
  state: MosaicDocument['state'],
  path: JsonPointer,
) {
  const key = node.bind;
  if (reservedNames.has(key)) {
    return issue(
      'INVALID_BINDING',
      appendJsonPointer(path, 'bind'),
      `State key "${key}" is reserved.`,
    );
  }
  if (!state || !Object.hasOwn(state, key)) {
    return issue(
      'INVALID_BINDING',
      appendJsonPointer(path, 'bind'),
      `State key "${key}" is not declared.`,
    );
  }
  const expected = stateBindingType(node);
  if (!expected) return; // when and stateValue accept every declared scalar, including null.
  if (typeof state[key] !== expected) {
    return issue(
      'INVALID_BINDING',
      appendJsonPointer(path, 'bind'),
      `The ${node.type} binding requires state key "${key}" to have type ${expected}.`,
    );
  }
}

function checkChart(node: ChartNode, dataset: IndexedDataset, path: JsonPointer) {
  for (const axis of ['x', 'y'] as const) {
    const key = node[axis];
    const kind = dataset.kinds.get(key);
    if (reservedNames.has(key)) {
      return issue(
        'INVALID_DATASET',
        appendJsonPointer(path, axis),
        `Column key "${key}" is reserved.`,
      );
    }
    if (!kind) {
      return issue(
        'INVALID_DATASET',
        appendJsonPointer(path, axis),
        `Column "${key}" is not declared in dataset "${node.dataset}".`,
      );
    }
    if (kind !== 'number' && !(axis === 'x' && kind === 'string')) {
      const expected = axis === 'x' ? 'string or number' : 'number';
      return issue(
        'INVALID_DATASET',
        appendJsonPointer(path, axis),
        `Chart ${axis} column "${key}" must have kind ${expected}.`,
      );
    }
  }
  if (dataset.rows.length <= MOSAIC_LIMITS.chartPoints) return;
  // A colon cannot occur in a v0.1 column key.
  const axes = node.x + ':' + node.y;
  if (dataset.checkedAxes.has(axes)) return;
  const error = checkChartPointLimit(dataset.rows, node.x, node.y, path);
  if (error) return error;
  dataset.checkedAxes.add(axes);
}

function checkTree(
  root: MosaicNode,
  state: MosaicDocument['state'],
  datasets: ReadonlyMap<string, IndexedDataset>,
) {
  const ids = new Set<string>();

  // Preflight has bounded the call depth to 20. Visit children in document order
  // so duplicate IDs consistently identify the later occurrence.
  function visit(node: MosaicNode, path: JsonPointer): MosaicError | undefined {
    if (ids.has(node.id)) {
      return issue(
        'DUPLICATE_ID',
        appendJsonPointer(path, 'id'),
        `Node ID "${node.id}" occurs more than once.`,
      );
    }
    ids.add(node.id);
    if ('bind' in node) {
      const error = checkBinding(node, state, path);
      if (error) return error;
    }
    if (node.type === 'chart' || node.type === 'table') {
      if (reservedNames.has(node.dataset)) {
        return issue(
          'INVALID_DATASET',
          appendJsonPointer(path, 'dataset'),
          `Dataset name "${node.dataset}" is reserved.`,
        );
      }
      const dataset = datasets.get(node.dataset);
      if (!dataset) {
        return issue(
          'INVALID_DATASET',
          appendJsonPointer(path, 'dataset'),
          `Dataset "${node.dataset}" is not declared.`,
        );
      }
      if (node.type === 'chart') return checkChart(node, dataset, path);
    }
    if ('children' in node) {
      const childrenPath = appendJsonPointer(path, 'children');
      for (const [i, child] of node.children.entries()) {
        const error = visit(child, appendJsonPointer(childrenPath, i));
        if (error) return error;
      }
    }
  }
  return visit(root, jsonPointer('root'));
}

/** Requires a successful structural check, including finite scalar values. */
export function validateSemantics(document: StructuralDocument): ParseResult {
  if (!hasLayoutRoot(document)) {
    return {
      ok: false,
      errors: [
        issue(
          'INVALID_ROOT',
          jsonPointer('root', 'type'),
          'The document root must be a column, row, grid, or card.',
        ),
      ],
    };
  }
  for (const key of Object.keys(document.state ?? {})) {
    if (reservedNames.has(key)) {
      return {
        ok: false,
        errors: [
          issue('INVALID_BINDING', jsonPointer('state', key), `State key "${key}" is reserved.`),
        ],
      };
    }
  }
  const datasets = new Map<string, IndexedDataset>();
  const error =
    indexDatasets(document.datasets, datasets) ??
    checkTree(document.root, document.state, datasets);
  return error ? { ok: false, errors: [error] } : { ok: true, document };
}
