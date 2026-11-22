import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { serializeGlyf } from '../src/core/serialize.ts';
import { minimalDocument, nodeSamples } from './fixtures.ts';
import { renderDocument } from './render-document.tsx';

function renderMarkdown(text: string): string {
  const doc = minimalDocument();
  const children = [nodeSamples.heading, { ...nodeSamples.markdown, text }];
  return renderDocument({ ...doc, root: { ...doc.root, children } });
}

describe('Glyf Markdown', () => {
  it.each([
    '',
    ' ',
    '![hidden](https://example.org/image.png)',
    '**![hidden](https://example.org/image.png)**',
  ])('omits an unnamed link with label %j after image removal', (label) => {
    expect(renderMarkdown(`[${label}](https://example.org/)`)).not.toContain('<a ');
  });

  it('retains a named link when an image beside its formatted text is removed', () => {
    const html = renderMarkdown(
      '[**Read** ![hidden](https://example.org/image.png)](https://example.org/)',
    );
    expect(html).toContain('<a href="https://example.org/"');
    expect(html).toContain('<strong>Read</strong>');
    expect(html).not.toContain('<img');
  });

  it('renders CommonMark block and inline elements', () => {
    const html = renderMarkdown(
      [
        '## Notes',
        '',
        'A **bold** and *emphasized* paragraph.',
        '',
        '> A quote with `inline code`.',
        '',
        '- one',
        '- two',
        '',
        '3. three',
        '4. four',
        '',
        '```html',
        '<b>literal example</b>',
        '```',
      ].join('\n'),
    );
    for (const fragment of [
      '<h2>Notes</h2>',
      '<p>A <strong>bold</strong> and <em>emphasized</em> paragraph.</p>',
      '<blockquote>\n<p>A quote with <code>inline code</code>.</p>\n</blockquote>',
      '<ul>\n<li>one</li>\n<li>two</li>\n</ul>',
      '<ol start="3">\n<li>three</li>\n<li>four</li>\n</ol>',
      '<pre tabindex="0" role="group" aria-label="Code block"><code class="language-html">&lt;b&gt;literal example&lt;/b&gt;\n</code></pre>',
    ])
      expect(html).toContain(fragment);
  });

  it('renders the reference demo Markdown in its document', () => {
    const demo = JSON.parse(
      readFileSync(new URL('../examples/glyf-demo.glyf', import.meta.url), 'utf8'),
    );
    expect(renderDocument(demo)).toContain('A compact, <strong>offline-first</strong> document');
  });

  it.each(['https://example.org/manual?q=1#intro', 'http://example.org', 'HTTPS://example.org'])(
    'protects the external link for %s',
    (url) => {
      const html = renderMarkdown(`[**Read**](${url} "Guide")`);
      expect(html).toContain(
        `<a href="${url}" title="Guide" target="_blank" rel="noopener noreferrer"><strong>Read</strong></a>`,
      );
    },
  );

  it('keeps mail links actionable and resolves a fragment to the rendered node', () => {
    const html = renderMarkdown('<team@example.org> and [jump][section]\n\n[section]: #heading');
    expect(html).toContain(
      '<a href="mailto:team@example.org" rel="noopener noreferrer">team@example.org</a>',
    );
    expect(html).toContain('<a href="#glyf-node-heading">jump</a>');
    expect(html).toContain('<h1 id="glyf-node-heading">');
  });

  it.each([
    'javascript:sample',
    'JaVaScRiPt:sample',
    'javascript&#58;sample',
    'java%73cript:sample',
    'j&#97;vascript&#58;sample',
    'java&#x09;script:sample',
    'java&#x0a;script:sample',
    'java&#x0d;script:sample',
    '&#x20;javascript:sample',
    'vbscript:sample',
    'blob:https://example.org/id',
    'data:text/plain,hello',
    'file:///notes',
    'ftp://example.org',
    '//example.org',
    '/local',
    '../local',
    'local',
    '?query',
    'https:local',
    'https://',
    'https://[invalid',
    '#',
    '#two/parts',
    '#:~:text=other',
  ])('keeps the formatted label without a link for %s', (url) => {
    const html = renderMarkdown(`[**label**](${url})`);
    expect(html).toContain('<p><strong>label</strong></p>');
    expect(html).not.toContain('<a ');
  });

  it('applies the same URL policy to reference links and autolinks', () => {
    const html = renderMarkdown('[first][ref] and <ftp://example.org>\n\n[ref]: /relative');
    expect(html).toContain('<p>first and ftp://example.org</p>');
  });

  it('ignores raw HTML tags and blocks while keeping ordinary text and literal code', () => {
    const html = renderMarkdown(
      'Before <b>middle</b> after.\n\n<div>ignored block</div>\n\n`<b>code</b>`',
    );
    expect(html).toContain('<p>Before middle after.</p>');
    expect(html).not.toContain('ignored block');
    expect(html).not.toContain('<b>');
    expect(html).toContain('<code>&lt;b&gt;code&lt;/b&gt;</code>');
  });

  it('renders the valid raw-markup fixture without script or SVG elements', () => {
    const file = new URL('../examples/invalid/malicious-markdown.glyf', import.meta.url);
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    const before = serializeGlyf(doc);
    const html = renderDocument(doc);
    expect(html).toContain('class="glyf-markdown">');
    expect(html).not.toMatch(/<(?:script|svg|title)\b/i);
    expect(serializeGlyf(doc)).toBe(before);
  });

  it('omits inline, reference, and raw HTML images, including their resource URLs', () => {
    const html = renderMarkdown(
      [
        'Before ![inline](https://example.org/inline.png) and ![reference][pic] after.',
        '',
        '[pic]: https://example.org/reference.png',
        '',
        '<img src="https://example.org/html.png">',
      ].join('\n'),
    );
    expect(html).toContain('<p>Before  and  after.</p>');
    expect(html).not.toMatch(/<(?:img|link)\b|example\.org/);
  });
});
