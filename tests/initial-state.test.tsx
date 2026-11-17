import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseMosaic } from '../src/core/parse.ts';
import { serializeMosaic } from '../src/core/serialize.ts';
import type { MosaicNode, MosaicScalar } from '../src/core/types.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { NodeRenderer } from '../src/render/NodeRenderer.tsx';
import { minimalDocument, nodeSamples, typedDocument } from './fixtures.ts';
import { renderDocument } from './render-document.tsx';

function withSavedValue(saved: MosaicScalar, children: readonly MosaicNode[]) {
  const doc = minimalDocument();
  return { ...doc, state: { saved }, root: { ...doc.root, children } };
}

describe('read-only initial state', () => {
  it.each<[MosaicScalar, MosaicScalar, boolean]>([
    [null, null, true],
    [false, false, true],
    [0, 0, true],
    ['', '', true],
    [true, 'true', false],
    [false, 0, false],
    [0, '0', false],
    ['', null, false],
  ])('compares saved %j to %j strictly (visible: %s)', (saved, equals, visible) => {
    const branch = { ...nodeSamples.when, bind: 'saved', equals, children: [nodeSamples.text] };
    const html = renderDocument(withSavedValue(saved, [branch]));
    expect(html.includes('Plain text')).toBe(visible);
  });

  it('skips hidden children during rendering after validation has checked the whole tree', () => {
    let reads = 0;
    const children = new Proxy([nodeSamples.text], {
      get(target, key, receiver) {
        if (key === '0') reads++;
        return Reflect.get(target, key, receiver);
      },
    });
    const branch = { ...nodeSamples.when, bind: 'saved', children };
    const result = validateMosaic(withSavedValue(false, [branch]));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    reads = 0;
    const html = renderToStaticMarkup(<NodeRenderer document={result.document} />);
    expect(html).not.toContain('Plain text');
    expect(reads).toBe(0);
  });

  it.each<[MosaicScalar, string]>([
    [null, '—'],
    [false, 'false'],
    [true, 'true'],
    [0, '0'],
    [-2.5, '-2.5'],
    ['', ''],
    ['<note>\n  next', '&lt;note&gt;\n  next'],
  ])('displays saved %j as text between the prefix and suffix', (saved, displayed) => {
    const value = { ...nodeSamples.stateValue, bind: 'saved', prefix: '<', suffix: '>' };
    const html = renderDocument(withSavedValue(saved, [value]));
    expect(html).toContain(`class="mosaic-text">&lt;${displayed}&gt;</span>`);
  });

  it.each(['first\nsecond', 'first\rsecond', 'first\r\n<second>'])(
    'keeps line breaks in a disabled multiline text control for %j',
    (saved) => {
      const input = { ...nodeSamples.input, bind: 'saved' };
      const html = renderDocument(withSavedValue(saved, [input]));
      expect(html).toContain(
        renderToStaticMarkup(
          <label id="mosaic-node-input">
            Note
            <textarea value={saved} disabled />
          </label>,
        ),
      );
    },
  );

  it.each<[MosaicScalar, 'number' | 'text']>([
    [-2.5, 'number'],
    ['', 'text'],
  ])(
    'shows %j in a disabled %s control with a label even when its supplied label is blank',
    (saved, kind) => {
      const input = { ...nodeSamples.input, bind: 'saved', kind, label: ' ' };
      const html = renderDocument(withSavedValue(saved, [input]));
      expect(html).toContain(
        renderToStaticMarkup(
          <label id="mosaic-node-input">
            saved
            <input type={kind} value={String(saved)} disabled />
          </label>,
        ),
      );
    },
  );

  it('uses the binding as the visible label for an unnamed toggle', () => {
    const toggle = { ...nodeSamples.toggle, bind: 'saved', label: '' };
    expect(renderDocument(withSavedValue(true, [toggle]))).toContain(
      renderToStaticMarkup(
        <label id="mosaic-node-toggle">
          <input type="checkbox" checked disabled />
          saved
        </label>,
      ),
    );
  });

  it('labels the chart by dataset when the chart title is blank', () => {
    const children = [{ ...nodeSamples.chart, title: '   ' }];
    const html = renderDocument({ ...typedDocument, root: { ...typedDocument.root, children } });
    expect(html).toMatch(/<figcaption[^>]*>values<\/figcaption>/);
    expect(html).toContain('role="img"');
  });

  it('renders the reference demo from its saved state and keeps the chart conditional', () => {
    const source = readFileSync(new URL('../examples/mosaic-demo.mosa', import.meta.url), 'utf8');
    const result = parseMosaic(source);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const doc = result.document;
    const before = serializeMosaic(doc);
    const html = renderToStaticMarkup(<NodeRenderer document={doc} />);
    expect(html).toContain(
      renderToStaticMarkup(
        <label id="mosaic-node-noteInput">
          Document note
          <input type="text" value="First report" disabled />
        </label>,
      ),
    );
    expect(html).toContain('Current note: First report</span>');
    expect(html).toContain(
      renderToStaticMarkup(
        <label id="mosaic-node-chartToggle">
          <input type="checkbox" checked disabled />
          Show revenue chart
        </label>,
      ),
    );
    expect(html).toMatch(/<figcaption[^>]*>Revenue by month<\/figcaption>/);
    expect(html).toContain('<caption>revenue</caption>');

    const hidden = renderDocument({ ...doc, state: { ...doc.state, showChart: false } });
    expect(hidden).not.toContain('mosaic-node-revenueChart');
    expect(hidden).toContain('<caption>revenue</caption>');
    expect(serializeMosaic(doc)).toBe(before);
  });
});
