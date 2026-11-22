import type { CSSProperties, ReactElement, ReactNode } from 'react';
import type { Gap, GlyfDocument, GlyfNode } from '../core/types.ts';
import { MarkdownView } from './MarkdownView.tsx';
import { TableView } from './TableView.tsx';
import { ChartView } from './ChartView.tsx';
import { InputView, ToggleView } from './StateControls.tsx';

export type NodesByType = { [Node in GlyfNode as Node['type']]: Node };

export type NodeView<Kind extends keyof NodesByType> = (props: {
  readonly node: NodesByType[Kind];
  readonly document: GlyfDocument;
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
      <div id={anchorId} className="glyf-column" style={{ gap: gapSize(node.gap) }}>
        {children}
      </div>
    );
  },
  row: function RowView({ node, children, anchorId }) {
    return (
      <div id={anchorId} className="glyf-row" style={{ gap: gapSize(node.gap) }}>
        {children}
      </div>
    );
  },
  grid: function GridView({ node, children, anchorId }) {
    const style = { '--glyf-columns': node.columns, '--glyf-gap': gapSize(node.gap) };
    return (
      <div id={anchorId} className="glyf-grid" style={style as CSSProperties}>
        {children}
      </div>
    );
  },
  card: function CardView({ node, children, anchorId }) {
    return (
      <section id={anchorId} className="glyf-card" aria-label={node.title || undefined}>
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
      <p id={anchorId} className="glyf-text">
        {node.text}
      </p>
    );
  },
  divider: function DividerView({ anchorId }) {
    return <hr id={anchorId} className="glyf-divider" />;
  },
  chart: ChartView,
  table: TableView,
  toggle: ToggleView,
  input: InputView,
  stateValue: function StateValueView({ node, document, anchorId }) {
    return (
      <span id={anchorId} className="glyf-text">
        {node.prefix}
        {String(document.state?.[node.bind] ?? '—')}
        {node.suffix}
      </span>
    );
  },
});
