import { Children, Component, isValidElement, memo, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import { remarkCheckDepth } from './markdown-depth.ts';
import { markdownUrl } from './markdown-policy.ts';
import type { NodeView } from './nodeRegistry.tsx';

function hasLinkText(children: ReactNode): boolean {
  const pending = Children.toArray(children);
  while (pending.length) {
    const child = pending.pop();
    if (typeof child === 'number' || (typeof child === 'string' && child.trim())) return true;
    if (isValidElement<{ children?: ReactNode }>(child)) {
      pending.push(...Children.toArray(child.props.children));
    }
  }
  return false;
}

const components: Components = {
  pre({ children }) {
    return (
      <pre tabIndex={0} role="group" aria-label="Code block">
        {children}
      </pre>
    );
  },
  a({ href, title, children }) {
    // Images are disabled; an image-only link must not leave an unnamed tab stop.
    if (!href || !hasLinkText(children)) return <>{children}</>;
    const webLink = /^https?:/i.test(href);
    return (
      <a
        href={href}
        title={title}
        target={webLink ? '_blank' : undefined}
        rel={href.startsWith('#') ? undefined : 'noopener noreferrer'}
      >
        {children}
      </a>
    );
  },
};

const disabledElements = ['img'];
const remarkPlugins = [remarkCheckDepth];

// The format bounds Markdown length, but its syntax can still overflow a
// dependency's recursive traversal. Contain failures within this node.
class MarkdownBoundary extends Component<{ text: string; children: ReactNode }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <>
        <p role="note">Markdown formatting could not be displayed. Showing the original text.</p>
        <pre className="glyf-markdown-fallback">{this.props.text}</pre>
      </>
    );
  }
}

// Parsing depends only on this node's text, not dataset/state snapshots. Keep
// reuse local to the mounted component so replacements release its entire tree.
const MarkdownContent = memo(function MarkdownContent({ text }: { text: string }) {
  return (
    <MarkdownBoundary key={text} text={text}>
      <Markdown
        skipHtml
        disallowedElements={disabledElements}
        urlTransform={markdownUrl}
        components={components}
        remarkPlugins={remarkPlugins}
      >
        {text}
      </Markdown>
    </MarkdownBoundary>
  );
});

export const MarkdownView: NodeView<'markdown'> = ({ node, anchorId }) => (
  <div id={anchorId} className="glyf-markdown">
    <MarkdownContent text={node.text} />
  </div>
);
