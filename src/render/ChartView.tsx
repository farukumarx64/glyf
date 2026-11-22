import { useEffect, useId, useRef, useState } from 'react';
import { chartGeometry, shortenChartLabel } from './chart-geometry.ts';
import type { NodeView } from './nodeRegistry.tsx';

export const ChartView: NodeView<'chart'> = ({ node, document, anchorId }) => {
  const figure = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(640);
  const titleId = useId();
  const summaryId = useId();
  const title = node.title?.trim() ? node.title : node.dataset;
  const chart = chartGeometry(node, document.datasets![node.dataset]!, width);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0)
        setWidth(Math.max(1, Math.round(entry.contentRect.width)));
    });
    observer.observe(figure.current!);
    return () => observer.disconnect();
  }, []);

  return (
    <figure id={anchorId} ref={figure} className="glyf-chart">
      <figcaption id={titleId}>{title}</figcaption>
      {chart.points && (
        <svg
          viewBox={`0 0 ${width} 274`}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={summaryId}
        >
          <g aria-hidden="true">
            {chart.yTicks.map((tick) => (
              <g key={tick.label} className={tick.zero ? 'glyf-chart-baseline' : 'glyf-chart-tick'}>
                <line x1={chart.left} x2={chart.right} y1={tick.y} y2={tick.y} />
                <text
                  x={chart.left - 8}
                  y={tick.y}
                  dy="0.35em"
                  textAnchor="end"
                  textLength={tick.label.length > 10 ? 64 : undefined}
                  lengthAdjust="spacingAndGlyphs"
                >
                  {tick.label}
                </text>
              </g>
            ))}
            <line
              className="glyf-chart-axis"
              x1={chart.left}
              x2={chart.left}
              y1={chart.top}
              y2={chart.bottom}
            />
            {node.kind === 'bar' ? (
              chart.points.map((point) => (
                <rect
                  key={point.id}
                  className="glyf-chart-bar"
                  x={point.x - chart.barWidth / 2}
                  y={Math.min(point.y, chart.baseline!)}
                  width={chart.barWidth}
                  height={Math.abs(point.y - chart.baseline!)}
                />
              ))
            ) : (
              <>
                <polyline
                  className="glyf-chart-line"
                  points={chart.points.map((point) => `${point.x},${point.y}`).join(' ')}
                />
                {chart.points.map((point) => (
                  <circle
                    key={point.id}
                    className="glyf-chart-point"
                    cx={point.x}
                    cy={point.y}
                    r="3"
                  />
                ))}
              </>
            )}
            {chart.xTicks.map((tick, i) => (
              <text
                key={i}
                className="glyf-chart-x-tick"
                x={tick.x}
                y={chart.bottom + 20}
                textAnchor={i === 0 ? 'start' : i === chart.xTicks.length - 1 ? 'end' : 'middle'}
                textLength={
                  tick.numeric && tick.label.length > chart.xLabelCharacters
                    ? chart.xLabelCharacters * 7
                    : undefined
                }
                lengthAdjust="spacingAndGlyphs"
              >
                {tick.numeric ? tick.label : shortenChartLabel(tick.label, chart.xLabelCharacters)}
              </text>
            ))}
            <text
              className="glyf-chart-axis-label"
              x={(chart.left + chart.right) / 2}
              y="266"
              textAnchor="middle"
            >
              {shortenChartLabel(
                chart.xLabel,
                Math.max(8, Math.floor((chart.right - chart.left) / 7)),
              )}
            </text>
          </g>
        </svg>
      )}
      <p id={summaryId}>{chart.summary}</p>
    </figure>
  );
};
