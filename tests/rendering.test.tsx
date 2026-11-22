import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { HeadingNode, GlyfNode } from '../src/core/types.ts';
import { nodeRegistry } from '../src/render/nodeRegistry.tsx';
import { minimalDocument, nodeSamples, typedDocument } from './fixtures.ts';
import { renderDocument } from './render-document.tsx';

describe('NodeRenderer', () => {
  it('renders the heading before the card and keeps the text inside the card in document order', () => {
    const doc = minimalDocument();
    const html = renderDocument({
      ...doc,
      root: {
        ...doc.root,
        children: [
          { id: 'overview', type: 'heading', level: 2, text: 'Overview' },
          {
            id: 'notes',
            type: 'card',
            children: [
              { id: 'z', type: 'text', text: 'First observation' },
              { id: 'a', type: 'text', text: 'Second observation' },
            ],
          },
        ],
      },
    });

    expect(html).toBe(
      renderToStaticMarkup(
        <div id="glyf-node-root" className="glyf-column">
          <h2 id="glyf-node-overview">Overview</h2>
          <section id="glyf-node-notes" className="glyf-card">
            <p id="glyf-node-z" className="glyf-text">
              First observation
            </p>
            <p id="glyf-node-a" className="glyf-text">
              Second observation
            </p>
          </section>
        </div>,
      ),
    );
  });

  it('registers exactly the v0.1 node kinds and narrows component props by kind', () => {
    expect(Object.keys(nodeRegistry).sort()).toEqual(Object.keys(nodeSamples).sort());
    expectTypeOf<keyof typeof nodeRegistry>().toEqualTypeOf<GlyfNode['type']>();
    expectTypeOf<Parameters<typeof nodeRegistry.heading>[0]['node']>().toEqualTypeOf<HeadingNode>();
  });

  it('dispatches every node kind in the validated full-vocabulary fixture', () => {
    const html = renderDocument(typedDocument);
    for (const fragment of [
      'class="glyf-column"',
      'class="glyf-row"',
      'class="glyf-grid"',
      'class="glyf-card"',
      '<h1 id="glyf-node-heading">Heading</h1>',
      '<strong>Markdown</strong>',
      'class="glyf-text">Plain text</p>',
      '<hr',
      'class="glyf-chart"',
      '<caption>values</caption>',
      'type="checkbox"',
      'checked',
      'type="text"',
      'value="Hello"',
      '<span id="glyf-node-stateValue" class="glyf-text">(Hello)</span>',
    ])
      expect(html).toContain(fragment);
  });

  it.each([nodeSamples.column, nodeSamples.row, nodeSamples.grid, nodeSamples.card])(
    'starts at a $type root, including an empty layout',
    (root) => {
      const doc = { ...minimalDocument(), root };
      expect(renderDocument(doc)).toContain(`class="glyf-${root.type}"`);
      expect(
        renderDocument({ ...doc, root: { ...root, children: [nodeSamples.divider] } }),
      ).toContain('<hr');
    },
  );

  it('uses strict initial-state equality to decide which children to render', () => {
    const doc = {
      ...minimalDocument(),
      state: { count: 0 },
      root: {
        ...minimalDocument().root,
        children: [
          {
            ...nodeSamples.when,
            bind: 'count',
            equals: 0,
            children: [
              { ...nodeSamples.card, children: [{ ...nodeSamples.text, text: 'Visible detail' }] },
            ],
          },
        ],
      },
    };
    expect(renderDocument(doc)).toContain('class="glyf-text">Visible detail</p>');
    expect(renderDocument({ ...doc, state: { count: '0' } })).toBe(
      '<div id="glyf-node-root" class="glyf-column"></div>',
    );
  });

  it('shows disabled controls and the saved scalar values, including zero and null', () => {
    const html = renderDocument({
      ...minimalDocument(),
      state: { on: false, n: 0, blank: null },
      root: {
        ...minimalDocument().root,
        children: [
          { ...nodeSamples.toggle, bind: 'on', label: 'Enabled' },
          { ...nodeSamples.input, kind: 'number', bind: 'n', label: 'Count' },
          { ...nodeSamples.stateValue, bind: 'blank' },
        ],
      },
    });
    expect(html).toBe(
      renderToStaticMarkup(
        <div id="glyf-node-root" className="glyf-column">
          <label id="glyf-node-toggle">
            <input type="checkbox" checked={false} disabled />
            Enabled
          </label>
          <label id="glyf-node-input">
            Count
            <input type="number" value={0} disabled />
          </label>
          <span id="glyf-node-stateValue" className="glyf-text">
            (—)
          </span>
        </div>,
      ),
    );
  });

  it.each([1, 2, 3, 4])('uses the semantic heading for level %i', (level) => {
    const doc = minimalDocument();
    const children = [{ ...nodeSamples.heading, level, text: 'A & B' }];
    expect(renderDocument({ ...doc, root: { ...doc.root, children } })).toContain(
      `<h${level} id="glyf-node-heading">A &amp; B</h${level}>`,
    );
  });

  it('escapes card titles and plain text, preserving line breaks and literal Markdown', () => {
    const children = [
      { ...nodeSamples.text, text: '**literal**\n<b>sample</b> & more' },
      nodeSamples.divider,
    ];
    const root = { ...nodeSamples.card, title: 'Notes & <more>', children };
    const html = renderDocument({ ...minimalDocument(), root });
    expect(html).toContain(
      'aria-label="Notes &amp; &lt;more&gt;"><strong>Notes &amp; &lt;more&gt;</strong>',
    );
    expect(html).toContain('**literal**\n&lt;b&gt;sample&lt;/b&gt; &amp; more</p><hr');
  });

  it.each([0, 1, 2, 3, 4, 5, 6])(
    'maps gap %i to the viewer spacing scale on each layout',
    (gap) => {
      for (const layout of [nodeSamples.column, nodeSamples.row, nodeSamples.grid]) {
        const html = renderDocument({ ...minimalDocument(), root: { ...layout, gap } });
        const property = layout.type === 'grid' ? '--glyf-gap' : 'gap';
        expect(html).toContain(`${property}:${gap * 0.25}rem`);
      }
    },
  );

  it.each([1, 2, 3, 4])(
    'passes the declared maximum of %i columns to the responsive grid',
    (columns) => {
      const root = { id: 'grid', type: 'grid', columns, children: [] };
      const html = renderDocument({ ...minimalDocument(), root });
      expect(html).toContain(`style="--glyf-columns:${columns}"`);
    },
  );
});
