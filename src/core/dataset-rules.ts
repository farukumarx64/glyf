import type { JsonPointer } from './json-pointer.ts';
import { checkResourceLimit, MOSAIC_LIMITS } from './limits.ts';
import type { ColumnKind, DatasetRow, MosaicScalar } from './types.ts';

export function isCellValue(value: unknown, kind: ColumnKind): value is MosaicScalar {
  return value === null || (typeof value === kind && (kind !== 'number' || Number.isFinite(value)));
}

/** Both axes must have a value. Zero and empty labels are valid coordinates. */
export function checkChartPointLimit(
  rows: readonly DatasetRow[],
  x: string,
  y: string,
  path: JsonPointer,
) {
  if (rows.length <= MOSAIC_LIMITS.chartPoints) return;
  let points = 0;
  for (const row of rows) {
    if (row[x] !== null && row[y] !== null) {
      points++;
      if (points > MOSAIC_LIMITS.chartPoints)
        return checkResourceLimit('chartPoints', points, path);
    }
  }
}
