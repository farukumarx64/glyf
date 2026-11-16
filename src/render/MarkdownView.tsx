import Markdown, { type Components } from 'react-markdown';
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

export const MarkdownView: NodeView<'markdown'> = ({ node, anchorId }) => (
  <div id={anchorId} className="mosaic-markdown">
    <Markdown
      skipHtml
      disallowedElements={disabledElements}
      urlTransform={markdownUrl}
      components={components}
    >
      {node.text}
    </Markdown>
  </div>
);
