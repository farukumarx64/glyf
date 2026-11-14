import type { MosaicError } from './errors.ts';
import type { JsonPointer } from './json-pointer.ts';

/** Inclusive v0.1 safety ceilings; never override them from document data. */
export const MOSAIC_LIMITS = Object.freeze({
  /** Actual UTF-8 bytes, including a BOM on import and formatting/newline on export. */
  fileBytes: 5 * 1024 * 1024,
  /** Root plus all descendants, including hidden conditional content. */
  nodes: 2_000,
  /** Node-tree depth, not the depth of every JSON object/array wrapper. */
  treeDepth: 20,
  datasets: 20,
  columnsPerDataset: 30,
  rowsPerDataset: 1_000,
  /** Sum rows × declared columns across all datasets; include nulls, exclude row IDs. */
  totalCells: 20_000,
  /** Per chart, after skipping rows with null x or y; retain numeric zero and empty labels. */
  chartPoints: 500,
  /** Unicode code points per Markdown node, matching JSON Schema maxLength. */
  markdownCharacters: 20_000,
  stateKeys: 100,
} as const);

export type MosaicResource = keyof typeof MOSAIC_LIMITS;

/** The root counts as both one node and the first level of the node tree. */
export const ROOT_NODE_DEPTH = 1;

const resourceLabels: Readonly<Record<MosaicResource, string>> = {
  fileBytes: 'File size in UTF-8 bytes',
  nodes: 'Document node count',
  treeDepth: 'Node-tree depth',
  datasets: 'Dataset count',
  columnsPerDataset: 'Columns per dataset',
  rowsPerDataset: 'Rows per dataset',
  totalCells: 'Total dataset cell count',
  chartPoints: 'Points per chart',
  markdownCharacters: 'Markdown character count',
  stateKeys: 'Persistent state key count',
};

/**
 * Compare an already measured count against the fixed contract and produce a
 * diagnostic only when it exceeds the ceiling. This does not inspect documents.
 * Invalid counts indicate caller bugs, so reject them instead of letting NaN or
 * a negative value accidentally pass. Document errors use the returned object.
 */
export function checkResourceLimit(
  resource: MosaicResource,
  count: number,
  path: JsonPointer,
): MosaicError | undefined {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('A resource count must be a non-negative safe integer.');
  }

  const limit = MOSAIC_LIMITS[resource];
  if (count <= limit) return undefined;

  return {
    code: resource === 'fileBytes' ? 'FILE_TOO_LARGE' : 'RESOURCE_LIMIT',
    path,
    message: `${resourceLabels[resource]} exceeds the limit of ${limit} (received ${count}).`,
  };
}
