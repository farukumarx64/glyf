import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { Gap, MosaicDocument, MosaicNode } from '../core/types.ts';
import { MarkdownView } from './MarkdownView.tsx';

export type NodesByType = { [Node in MosaicNode as Node['type']]: Node };

export type NodeView<Kind extends keyof NodesByType> = (props: {
  readonly node: NodesByType[Kind];
  readonly document: MosaicDocument;
  readonly anchorId: string;
  readonly children?: ReactNode;
}) => ReactElement | null;

type NodeRegistry = {
  readonly [Kind in keyof NodesByType]: NodeView<Kind>;
};

const headingTags = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' } as const;

function gapSize(gap?: Gap) {
  return gap === undefined ? undefined : `${gap * 0.25}rem`;
}

export const nodeRegistry = Object.freeze<NodeRegistry>({
  column: function ColumnView({ node, children, anchorId }) {
    return (
      <div id={anchorId} className="mosaic-column" style={{ gap: gapSize(node.gap) }}>
        {children}
      </div>
    );
  },
  row: function RowView({ node, children, anchorId }) {
    return (
      <div id={anchorId} className="mosaic-row" style={{ gap: gapSize(node.gap) }}>
        {children}
      </div>
    );
  },
  grid: function GridView({ node, children, anchorId }) {
    const style = { '--mosaic-columns': node.columns, '--mosaic-gap': gapSize(node.gap) };
    return (
      <div id={anchorId} className="mosaic-grid" style={style as CSSProperties}>
        {children}
      </div>
    );
  },
  card: function CardView({ node, children, anchorId }) {
    return (
      <section id={anchorId} className="mosaic-card" aria-label={node.title || undefined}>
        {node.title && <strong>{node.title}</strong>}
        {children}
      </section>
    );
  },
  when: function WhenView({ node, document, children }) {
    return document.state?.[node.bind] === node.equals ? <>{children}</> : null;
  },
  heading: function HeadingView({ node, anchorId }) {
    const Heading = headingTags[node.level];
    return <Heading id={anchorId}>{node.text}</Heading>;
  },
  markdown: MarkdownView,
  text: function TextView({ node, anchorId }) {
    return (
      <p id={anchorId} className="mosaic-text">
        {node.text}
      </p>
    );
  },
  divider: function DividerView({ anchorId }) {
    return <hr id={anchorId} className="mosaic-divider" />;
  },
  chart: function ChartView({ node, anchorId }) {
    return <p id={anchorId}>Chart placeholder for {node.title || node.dataset}</p>;
  },
  table: function TableView({ node, anchorId }) {
    return <p id={anchorId}>Table placeholder for {node.dataset}</p>;
  },
  toggle: function ToggleView({ node, document, anchorId }) {
    return (
      <label id={anchorId}>
        <input type="checkbox" checked={document.state?.[node.bind] === true} disabled />
        {node.label}
      </label>
    );
  },
  input: function InputView({ node, document, anchorId }) {
    return (
      <label id={anchorId}>
        {node.label}
        <input type={node.kind} value={String(document.state?.[node.bind] ?? '')} disabled />
      </label>
    );
  },
  stateValue: function StateValueView({ node, document, anchorId }) {
    return (
      <span id={anchorId}>
        {node.prefix}
        {String(document.state?.[node.bind] ?? '—')}
        {node.suffix}
      </span>
    );
  },
});
