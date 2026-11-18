// A viewer budget, not a Mosaic format limit. The Markdown AST root is depth 0;
// every child (including text) adds one. Leave ample headroom for recursive
// dependency traversals and prevent engine-dependent, thousands-deep DOM trees.
export const MARKDOWN_RENDER_DEPTH = 128;

interface MarkdownTree {
  children?: readonly MarkdownTree[];
}

/** Run after parsing, before react-markdown's recursive Markdown-to-HTML stages. */
export function remarkCheckDepth() {
  return (tree: MarkdownTree) => {
    const stack = [{ node: tree, depth: 0 }];
    while (stack.length) {
      const { node, depth } = stack.pop()!;
      if (depth > MARKDOWN_RENDER_DEPTH) {
        // The node's error boundary presents escaped source without changing it.
        throw new RangeError('Markdown nesting exceeds the viewer rendering budget.');
      }
      if (node.children) {
        for (const child of node.children) stack.push({ node: child, depth: depth + 1 });
      }
    }
  };
}
