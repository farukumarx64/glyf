import type { MosaicDocument } from '../core/types.ts';
import { nodeAnchorId } from './markdown-policy.ts';
import { nodeRegistry, type NodesByType, type NodeView } from './nodeRegistry.tsx';
import './nodes.css';

// Keep the discriminator and its node type paired through the registry lookup.
function RenderNode<Kind extends keyof NodesByType>({
  node,
  document,
}: {
  readonly node: NodesByType[Kind] & { readonly type: Kind };
  readonly document: MosaicDocument;
}) {
  const Component: NodeView<Kind> = nodeRegistry[node.type];
  return (
    <Component node={node} document={document} anchorId={nodeAnchorId(node.id)}>
      {'children' in node &&
        node.children.map((child) => (
          <RenderNode key={child.id} node={child} document={document} />
        ))}
    </Component>
  );
}

/** Pass the document from a successful parseMosaic or validateMosaic result. */
export function NodeRenderer({ document }: { readonly document: MosaicDocument }) {
  return <RenderNode node={document.root} document={document} />;
}
