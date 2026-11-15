import type { ReactElement, ReactNode } from 'react';
import type { Gap, MosaicDocument, MosaicNode } from '../core/types.ts';

export type NodesByType = { [Node in MosaicNode as Node['type']]: Node };

export type NodeView<Kind extends keyof NodesByType> = (props: {
  readonly node: NodesByType[Kind];
  readonly document: MosaicDocument;
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
  column: function ColumnView({ node, children }) {
    return (
      <div className="mosaic-column" style={{ gap: gapSize(node.gap) }}>
        {children}
      </div>
    );
  },
  row: function RowView({ node, children }) {
    return (
      <div className="mosaic-row" style={{ gap: gapSize(node.gap) }}>
        {children}
      </div>
    );
  },
  grid: function GridView({ node, children }) {
    return (
      <div
        className="mosaic-grid"
        style={{
          gridTemplateColumns: `repeat(${node.columns}, minmax(0, 1fr))`,
          gap: gapSize(node.gap),
        }}
      >
        {children}
      </div>
    );
  },
  card: function CardView({ node, children }) {
    return (
      <section className="mosaic-card">
        {node.title && <strong>{node.title}</strong>}
        {children}
      </section>
    );
  },
  when: function WhenView({ node, document, children }) {
    return document.state?.[node.bind] === node.equals ? <>{children}</> : null;
  },
  heading: function HeadingView({ node }) {
    const Heading = headingTags[node.level];
    return <Heading>{node.text}</Heading>;
  },
  markdown: function MarkdownView({ node }) {
    // Keep Markdown literal until the Markdown renderer and URL policy land together.
    return <p className="mosaic-markdown">{node.text}</p>;
  },
  text: function TextView({ node }) {
    return <p>{node.text}</p>;
  },
  divider: function DividerView() {
    return <hr />;
  },
  chart: function ChartView({ node }) {
    return <p>Chart placeholder for {node.title || node.dataset}</p>;
  },
  table: function TableView({ node }) {
    return <p>Table placeholder for {node.dataset}</p>;
  },
  toggle: function ToggleView({ node, document }) {
    return (
      <label>
        <input type="checkbox" checked={document.state?.[node.bind] === true} disabled />
        {node.label}
      </label>
    );
  },
  input: function InputView({ node, document }) {
    return (
      <label>
        {node.label}
        <input type={node.kind} value={String(document.state?.[node.bind] ?? '')} disabled />
      </label>
    );
  },
  stateValue: function StateValueView({ node, document }) {
    return (
      <span>
        {node.prefix}
        {String(document.state?.[node.bind] ?? '—')}
        {node.suffix}
      </span>
    );
  },
});
