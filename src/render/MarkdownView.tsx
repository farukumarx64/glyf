import { Component, type ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import { remarkCheckDepth } from './markdown-depth.ts';
import { markdownUrl } from './markdown-policy.ts';
import type { NodeView } from './nodeRegistry.tsx';

const components: Components = {
  a({ href, title, children }) {
    if (!href) return <>{children}</>;
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
        <pre className="mosaic-markdown-fallback">{this.props.text}</pre>
      </>
    );
  }
}

export const MarkdownView: NodeView<'markdown'> = ({ node, anchorId }) => (
  <div id={anchorId} className="mosaic-markdown">
    <MarkdownBoundary key={node.text} text={node.text}>
      <Markdown
        skipHtml
        disallowedElements={disabledElements}
        urlTransform={markdownUrl}
        components={components}
        remarkPlugins={remarkPlugins}
      >
        {node.text}
      </Markdown>
    </MarkdownBoundary>
  </div>
);
