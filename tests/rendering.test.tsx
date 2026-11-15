import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { HeadingNode, MosaicNode } from '../src/core/types.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { NodeRenderer } from '../src/render/NodeRenderer.tsx';
import { nodeRegistry } from '../src/render/nodeRegistry.tsx';
import { minimalDocument, nodeSamples, typedDocument } from './fixtures.ts';

function renderDocument(value: unknown) {
  const result = validateMosaic(value);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return renderToStaticMarkup(<NodeRenderer document={result.document} />);
}

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
        <div className="mosaic-column">
          <h2>Overview</h2>
          <section className="mosaic-card">
            <p>First observation</p>
            <p>Second observation</p>
          </section>
        </div>,
      ),
    );
  });

  it('registers exactly the v0.1 node kinds and narrows component props by kind', () => {
    expect(Object.keys(nodeRegistry).sort()).toEqual(Object.keys(nodeSamples).sort());
    expectTypeOf<keyof typeof nodeRegistry>().toEqualTypeOf<MosaicNode['type']>();
    expectTypeOf<Parameters<typeof nodeRegistry.heading>[0]['node']>().toEqualTypeOf<HeadingNode>();
  });

  it('dispatches every node kind in the validated full-vocabulary fixture', () => {
    const html = renderDocument(typedDocument);
    for (const fragment of [
      'class="mosaic-column"',
      'class="mosaic-row"',
      'class="mosaic-grid"',
      'class="mosaic-card"',
      '<h1>Heading</h1>',
      '**Markdown**',
      '<p>Plain text</p>',
      '<hr',
      'Chart placeholder for Values',
      'Table placeholder for values',
      'type="checkbox"',
      'checked',
      'type="text"',
      'value="Hello"',
      '<span>(Hello)</span>',
    ])
      expect(html).toContain(fragment);
  });

  it.each([nodeSamples.column, nodeSamples.row, nodeSamples.grid, nodeSamples.card])(
    'starts at a $type root, including an empty layout',
    (root) => {
      const doc = { ...minimalDocument(), root };
      expect(renderDocument(doc)).toContain(`class="mosaic-${root.type}"`);
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
    expect(renderDocument(doc)).toContain('<p>Visible detail</p>');
    expect(renderDocument({ ...doc, state: { count: '0' } })).toBe(
      '<div class="mosaic-column"></div>',
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
        <div className="mosaic-column">
          <label>
            <input type="checkbox" checked={false} disabled />
            Enabled
          </label>
          <label>
            Count
            <input type="number" value={0} disabled />
          </label>
          <span>(—)</span>
        </div>,
      ),
    );
  });

  it('keeps markup in node text and Markdown source inert', () => {
    const literal = '<b>sample</b> & more';
    const html = renderDocument({
      ...minimalDocument(),
      root: {
        ...minimalDocument().root,
        children: [
          { ...nodeSamples.text, text: literal },
          { ...nodeSamples.markdown, text: literal },
        ],
      },
    });
    expect(html.split('&lt;b&gt;sample&lt;/b&gt; &amp; more')).toHaveLength(3);
    expect(html).not.toContain('<b>');
  });
});
