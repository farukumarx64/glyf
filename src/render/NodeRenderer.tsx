import type { GlyfDocument, GlyfNode } from '../core/types.ts';
import type { DocumentStore } from '../core/store.ts';
import { CellEditingContext } from './cell-editing-context.ts';
import { StateEditingContext } from './state-editing-context.ts';
import { nodeAnchorId } from './markdown-policy.ts';
import { nodeRegistry, type NodesByType, type NodeView } from './nodeRegistry.tsx';
import './nodes.css';

// A hidden when omits this component, so its child array is never mapped during rendering.
function ChildNodes({
  nodes,
  document,
}: {
  readonly nodes: readonly GlyfNode[];
  readonly document: GlyfDocument;
}) {
  return nodes.map((child) => <RenderNode key={child.id} node={child} document={document} />);
}

// Keep the discriminator and its node type paired through the registry lookup.
function RenderNode<Kind extends keyof NodesByType>({
  node,
  document,
}: {
  readonly node: NodesByType[Kind] & { readonly type: Kind };
  readonly document: GlyfDocument;
}) {
  const Component: NodeView<Kind> = nodeRegistry[node.type];
  return (
    <Component node={node} document={document} anchorId={nodeAnchorId(node.id)}>
      {'children' in node && <ChildNodes nodes={node.children} document={document} />}
    </Component>
  );
}

/** Pass the document from a successful parseGlyf or validateGlyf result. */
export function NodeRenderer({
  document,
  onCellEdit,
  onStateEdit,
}: {
  readonly document: GlyfDocument;
  readonly onCellEdit?: DocumentStore['updateCell'];
  readonly onStateEdit?: DocumentStore['updateState'];
}) {
  return (
    <CellEditingContext value={onCellEdit}>
      <StateEditingContext value={onStateEdit}>
        <RenderNode node={document.root} document={document} />
      </StateEditingContext>
    </CellEditingContext>
  );
}
