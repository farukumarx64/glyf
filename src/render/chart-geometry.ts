import type { ChartNode, Dataset } from '../core/types.ts';

interface Point {
  id: string;
  label: string | number;
  value: number;
}

interface Range {
  min: number;
  max: number;
}

/** A constant series gets a finite range, including at JavaScript's numeric extremes. */
function expandRange(min: number, max: number): Range {
  if (min !== max) return { min, max };
  const padding = min === 0 ? 1 : Math.abs(min) * 0.1 || Number.MIN_VALUE;
  const lower = min - padding;
  const upper = max + padding;
  return {
    min: Number.isFinite(lower) ? lower : min,
    max: Number.isFinite(upper) ? upper : max,
  };
}

function fraction(value: number, { min, max }: Range) {
  const span = max - min;
  if (Number.isFinite(span)) return (value - min) / span;
  // Opposite finite extremes can have an infinite difference. Scale first.
  const magnitude = Math.max(Math.abs(min), Math.abs(max));
  return (value / magnitude - min / magnitude) / (max / magnitude - min / magnitude);
}

function tickValues({ min, max }: Range, count: number) {
  const span = max - min;
  return [
    ...new Set(
      Array.from({ length: count }, (_, i) => {
        if (i === 0) return min;
        if (i === count - 1) return max;
        const part = i / (count - 1);
        return Number.isFinite(span) ? min + span * part : min * (1 - part) + max * part;
      }),
    ),
  ];
}

function numericLabels(values: readonly number[]) {
  const labels = values.map((value) => {
    const rounded = Number(value.toPrecision(4));
    return String(Number.isFinite(rounded) ? rounded : value);
  });
  // Close, distinct values must keep distinct labels.
  return new Set(labels).size === values.length ? labels : values.map(String);
}

export function shortenChartLabel(value: string, length = 14) {
  const characters = Array.from(value.slice(0, length * 2 + 2));
  return characters.length <= length ? value : characters.slice(0, length - 1).join('') + '…';
}

/** Requires validated data. Geometry is bounded by the 500-point format limit. */
export function chartGeometry(node: ChartNode, dataset: Dataset, width: number) {
  const points: Point[] = [];
  for (const row of dataset.rows) {
    const x = row[node.x];
    const y = row[node.y];
    if (x !== null && y !== null) {
      points.push({ id: row.id, label: x as string | number, value: y as number });
    }
  }
  const xColumn = dataset.columns.find((column) => column.key === node.x)!;
  const yColumn = dataset.columns.find((column) => column.key === node.y)!;
  const xLabel = xColumn.label.trim() ? xColumn.label : xColumn.key;
  const yLabel = yColumn.label.trim() ? yColumn.label : yColumn.key;
  const skipped = dataset.rows.length - points.length;
  const skippedText = skipped
    ? ` ${skipped} ${skipped === 1 ? 'row' : 'rows'} skipped because x or y is null.`
    : '';
  if (points.length === 0) {
    return {
      summary: 'No plottable data.' + (skipped ? skippedText : ' The dataset is empty.'),
    } as const;
  }

  const values = points.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const summary = `${node.kind === 'bar' ? 'Bar' : 'Line'} chart of ${yLabel} by ${xLabel}. ${points.length} ${points.length === 1 ? 'point' : 'points'}. Values range from ${minimum} to ${maximum}.${skippedText}`;
  const yRange =
    node.kind === 'bar'
      ? expandRange(Math.min(0, minimum), Math.max(0, maximum))
      : expandRange(minimum, maximum);
  const left = 76;
  const right = Math.max(left + 1, width - 16);
  const top = 18;
  const bottom = 218;
  const plotWidth = right - left;
  const yPosition = (value: number) => bottom - fraction(value, yRange) * (bottom - top);
  const numericX = node.kind === 'line' && xColumn.kind === 'number';
  let xRange: Range | undefined;
  if (numericX) {
    const xValues = points.map((point) => point.label as number);
    xRange = expandRange(Math.min(...xValues), Math.max(...xValues));
  }
  const slotWidth = plotWidth / points.length;
  const positioned = points.map((point, i) => ({
    ...point,
    x: xRange
      ? left + fraction(point.label as number, xRange) * plotWidth
      : left + slotWidth * (i + 0.5),
    y: yPosition(point.value),
  }));
  const xTickCount = Math.min(5, Math.max(2, Math.floor(plotWidth / 90) + 1));
  let xTicks: { x: number; label: string; numeric: boolean }[];
  if (xRange) {
    const values = tickValues(xRange, xTickCount);
    const labels = numericLabels(values);
    xTicks = values.map((value, i) => ({
      x: left + fraction(value, xRange) * plotWidth,
      label: labels[i]!,
      numeric: true,
    }));
  } else {
    const count = Math.min(xTickCount, points.length);
    xTicks = Array.from({ length: count }, (_, i) => {
      const index = count === 1 ? 0 : Math.round((i * (points.length - 1)) / (count - 1));
      const point = positioned[index]!;
      return { x: point.x, label: String(point.label), numeric: typeof point.label === 'number' };
    });
  }
  const hasZero = yRange.min <= 0 && yRange.max >= 0;
  const baseline = hasZero ? yPosition(0) : undefined;
  // Keep the zero label legible even when one end of a signed range is near it.
  const yValues = tickValues(yRange, 5).filter(
    (value) => baseline === undefined || Math.abs(yPosition(value) - baseline) >= 16,
  );
  if (hasZero) yValues.push(0);
  const yLabels = numericLabels(yValues);
  const tickSpacing =
    xTicks.length > 1 ? (xTicks.at(-1)!.x - xTicks[0]!.x) / (xTicks.length - 1) : plotWidth;
  return {
    summary,
    points: positioned,
    xTicks,
    xLabel,
    left,
    right,
    top,
    bottom,
    barWidth: slotWidth * 0.7,
    xLabelCharacters: Math.max(3, Math.min(14, Math.floor(tickSpacing / 14))),
    baseline,
    yTicks: yValues.map((value, i) => ({
      y: yPosition(value),
      label: yLabels[i]!,
      zero: value === 0,
    })),
  };
}
