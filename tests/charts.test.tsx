// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentView } from '../src/app/DocumentView.tsx';
import { serializeMosaic } from '../src/core/serialize.ts';
import { createDocumentStore } from '../src/core/store.ts';
import type { ChartNode, Dataset } from '../src/core/types.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { chartGeometry } from '../src/render/chart-geometry.ts';
import { minimalDocument, nodeSamples } from './fixtures.ts';

afterEach(cleanup);

function dataset(
  pairs: readonly (readonly [string | number | null, number | null])[],
  numeric = false,
): Dataset {
  return {
    columns: [
      { key: 'label', label: 'Category', kind: numeric ? 'number' : 'string' },
      { key: 'amount', label: 'Amount', kind: 'number', editable: true },
    ],
    rows: pairs.map(([label, amount], i) => ({ id: 'r' + i, label, amount })),
  };
}

function openCharts(data: Dataset, kind: ChartNode['kind'] = 'bar') {
  const doc = minimalDocument();
  const opened = validateMosaic({
    ...doc,
    datasets: { values: data },
    root: { ...doc.root, children: [{ ...nodeSamples.chart, kind }, nodeSamples.table] },
  });
  if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
  const store = createDocumentStore(opened);
  render(<DocumentView store={store} fileName="chart.mosa" />);
  return store;
}

function geometry(data: Dataset, kind: ChartNode['kind'] = 'bar') {
  const chart = chartGeometry({ ...nodeSamples.chart, kind }, data, 400);
  if (!chart.points) throw new Error('Expected plotted data.');
  return chart;
}

describe('SVG charts', () => {
  it('renders ordered signed bars around zero with a labeled summary and preserves the document', () => {
    const store = openCharts(
      dataset([
        ['Z', -10],
        ['A', 0],
        ['Z', 20],
        [null, 8],
        ['skip', null],
      ]),
    );
    const before = serializeMosaic(store.getSnapshot());
    const svg = screen.getByRole('img', { name: 'Values' });
    const description = document.getElementById(svg.getAttribute('aria-describedby')!)!;
    expect(description.textContent).toBe(
      'Bar chart of Amount by Category. 3 points. Values range from -10 to 20. 2 rows skipped because x or y is null.',
    );
    const bars = [...svg.querySelectorAll('rect')];
    expect(bars).toHaveLength(3);
    const baseline = Number(svg.querySelector('.mosaic-chart-baseline line')?.getAttribute('y1'));
    const ys = bars.map((bar) => Number(bar.getAttribute('y')));
    const heights = bars.map((bar) => Number(bar.getAttribute('height')));
    expect(ys[0]).toBe(baseline);
    expect(heights[0]).toBeGreaterThan(0);
    expect(heights[1]).toBe(0);
    expect(ys[2]! + heights[2]!).toBeCloseTo(baseline);
    expect(
      [...svg.querySelectorAll('.mosaic-chart-x-tick')].map((tick) => tick.textContent),
    ).toEqual(['Z', 'A', 'Z']);
    expect(serializeMosaic(store.getSnapshot())).toBe(before);
  });

  it.each(['bar', 'line'] as const)(
    'handles empty and all-null %s data without drawing artificial points',
    (kind) => {
      openCharts(dataset([]), kind);
      expect(screen.getByText('No plottable data. The dataset is empty.')).toBeTruthy();
      expect(screen.queryByRole('img')).toBeNull();
      cleanup();
      openCharts(
        dataset([
          [null, 4],
          ['', null],
          [null, null],
        ]),
        kind,
      );
      expect(
        screen.getByText('No plottable data. 3 rows skipped because x or y is null.'),
      ).toBeTruthy();
      expect(screen.queryByRole('img')).toBeNull();
    },
  );

  it('keeps empty string labels and zero values and connects the remaining line points in file order', () => {
    openCharts(
      dataset([
        ['Z', 5],
        ['skip', null],
        [null, -100],
        ['', 0],
        ['A', -5],
      ]),
      'line',
    );
    const svg = screen.getByRole('img', { name: 'Values' });
    const circles = [...svg.querySelectorAll('circle')];
    expect(circles).toHaveLength(3);
    const coordinates = circles.map((point) => [
      Number(point.getAttribute('cx')),
      Number(point.getAttribute('cy')),
    ]);
    expect(coordinates[0]![0]).toBeLessThan(coordinates[1]![0]!);
    expect(coordinates[1]![0]).toBeLessThan(coordinates[2]![0]!);
    expect(coordinates[0]![1]).toBeLessThan(coordinates[1]![1]!);
    expect(coordinates[1]![1]).toBeLessThan(coordinates[2]![1]!);
    expect(svg.querySelector('polyline')?.getAttribute('points')).toBe(
      coordinates.map((point) => point.join(',')).join(' '),
    );
  });

  it('uses proportional numeric line coordinates while preserving connection order', () => {
    const data = dataset(
      [
        [10, 1],
        [1, 2],
        [2, 3],
      ],
      true,
    );
    const line = geometry(data, 'line');
    const [first, second, third] = line.points;
    expect(first!.x).toBe(line.right);
    expect(second!.x).toBe(line.left);
    expect(third!.x - second!.x).toBeCloseTo((line.right - line.left) / 9);
    expect(line.points.map((point) => point.id)).toEqual(['r0', 'r1', 'r2']);
    const bars = geometry(data);
    expect(bars.points[0]!.x).toBeLessThan(bars.points[1]!.x);
    expect(bars.points[1]!.x).toBeLessThan(bars.points[2]!.x);
  });

  it.each([0, 5, -5, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE])(
    'renders single and repeated values at %s with finite coordinates',
    (value) => {
      for (const kind of ['bar', 'line'] as const) {
        for (const pairs of [
          [[value, value]],
          [
            [value, value],
            [value, value],
          ],
        ] as const) {
          const chart = geometry(dataset(pairs, true), kind);
          for (const point of chart.points) {
            expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
            expect(point.y).toBeGreaterThanOrEqual(chart.top);
            expect(point.y).toBeLessThanOrEqual(chart.bottom);
          }
          for (const tick of chart.yTicks) expect(Number.isFinite(tick.y)).toBe(true);
          expect(chart.yTicks.every((tick) => Number.isFinite(Number(tick.label)))).toBe(true);
          expect(chart.xTicks.every((tick) => Number.isFinite(Number(tick.label)))).toBe(true);
          expect(new Set(chart.yTicks.map((tick) => tick.label)).size).toBe(chart.yTicks.length);
        }
      }
    },
  );

  it.each(['bar', 'line'] as const)(
    'keeps %s geometry finite across opposite numeric extremes',
    (kind) => {
      const chart = geometry(
        dataset(
          [
            [-Number.MAX_VALUE, -Number.MAX_VALUE],
            [0, 0],
            [Number.MAX_VALUE, Number.MAX_VALUE],
          ],
          true,
        ),
        kind,
      );
      expect(chart.points.map((point) => point.y)).toEqual([
        chart.bottom,
        (chart.bottom + chart.top) / 2,
        chart.top,
      ]);
      for (const tick of chart.yTicks) expect(Number.isFinite(tick.y)).toBe(true);
      expect(chart.baseline).toBe((chart.bottom + chart.top) / 2);
    },
  );

  it('scales a line to its data range and distinguishes adjacent representable numbers', () => {
    const chart = geometry(
      dataset([
        ['a', 1e15],
        ['b', 1e15 + 1],
      ]),
      'line',
    );
    expect(chart.baseline).toBeUndefined();
    expect(chart.points.map((point) => point.y)).toEqual([chart.bottom, chart.top]);
    expect(chart.yTicks[0]?.label).toBe('1000000000000000');
    expect(chart.yTicks.at(-1)?.label).toBe('1000000000000001');
  });

  it.each(['bar', 'line'] as const)('handles an entirely negative %s series', (kind) => {
    const chart = geometry(
      dataset([
        ['A', -10],
        ['B', -20],
        ['C', -5],
      ]),
      kind,
    );
    expect(chart.points[1]?.y).toBe(chart.bottom);
    if (kind === 'bar') {
      expect(chart.baseline).toBe(chart.top);
      expect(chart.points.every((point) => point.y > chart.baseline!)).toBe(true);
    } else {
      expect(chart.baseline).toBeUndefined();
      expect(chart.points[2]?.y).toBe(chart.top);
    }
  });

  it('shows a single line point as a visible marker', () => {
    openCharts(dataset([['Only', 7]]), 'line');
    const svg = screen.getByRole('img', { name: 'Values' });
    expect(svg.querySelectorAll('circle')).toHaveLength(1);
    expect(Number(svg.querySelector('circle')?.getAttribute('r'))).toBeGreaterThan(0);
    expect(screen.getByText(/1 point. Values range from 7 to 7/)).toBeTruthy();
  });

  it('keeps labels clear of zero for a strongly asymmetric signed range', () => {
    const chart = geometry(
      dataset([
        ['A', -1],
        ['B', 1e6],
      ]),
    );
    expect(chart.yTicks.some((tick) => tick.zero && tick.label === '0')).toBe(true);
    for (const tick of chart.yTicks) {
      if (!tick.zero) expect(Math.abs(tick.y - chart.baseline!)).toBeGreaterThanOrEqual(16);
    }
  });

  it('caps axis labels for 500 points and renders hostile or long labels as bounded text', () => {
    const text = '<svg onload="sample">😀'.repeat(100);
    const pairs = Array.from({ length: 500 }, (_, i) => [text + i, i] as const);
    openCharts(dataset(pairs));
    const svg = screen.getByRole('img');
    expect(svg.querySelectorAll('rect')).toHaveLength(500);
    const xTicks = svg.querySelectorAll('.mosaic-chart-x-tick');
    expect(xTicks.length).toBeLessThanOrEqual(5);
    expect([...xTicks].every((tick) => Array.from(tick.textContent!).length <= 14)).toBe(true);
    expect(
      svg.querySelectorAll('.mosaic-chart-tick, .mosaic-chart-baseline').length,
    ).toBeLessThanOrEqual(6);
    expect(svg.querySelector('svg, script, img, foreignObject')).toBeNull();
  });

  it('updates the chart summary and geometry from committed store edits', () => {
    const store = openCharts(
      dataset([
        ['A', 10],
        ['B', 15],
        ['C', 20],
        ['D', null],
      ]),
      'line',
    );
    const svg = screen.getByRole('img');
    const originalPoints = svg.querySelector('polyline')!.getAttribute('points');
    act(() => {
      expect(store.updateCell('table', 'r0', 'amount', -10).ok).toBe(true);
    });
    expect(svg.querySelector('polyline')!.getAttribute('points')).not.toBe(originalPoints);
    expect(screen.getByText(/Values range from -10 to 20/)).toBeTruthy();
    act(() => {
      expect(store.updateCell('table', 'r3', 'amount', 0).ok).toBe(true);
    });
    expect(svg.querySelectorAll('circle')).toHaveLength(4);
    expect(screen.getByText(/4 points/).textContent).not.toContain('skipped');
  });
});
