// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import demoSource from '../examples/mosaic-demo.mosa?raw';
import { DocumentView } from '../src/app/DocumentView.tsx';
import { parseMosaic } from '../src/core/parse.ts';
import { createDocumentStore } from '../src/core/store.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { MarkdownView } from '../src/render/MarkdownView.tsx';
import { minimalDocument, nodeSamples, typedDocument } from './fixtures.ts';

const processing = vi.hoisted(() => ({ count: 0 }));
vi.mock('../src/render/markdown-depth.ts', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/render/markdown-depth.ts')>();
  return {
    ...original,
    remarkCheckDepth: () => {
      const check = original.remarkCheckDepth();
      return (tree: Parameters<typeof check>[0]) => {
        processing.count++;
        return check(tree);
      };
    },
  };
});

afterEach(() => {
  cleanup();
  processing.count = 0;
});

function storeFor(value: unknown) {
  const result = validateMosaic(value);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return createDocumentStore(result);
}

describe('Markdown processing during document updates', () => {
  it('reuses unchanged Markdown while cell edits, state values and chart conditions still update', () => {
    const result = parseMosaic(demoSource);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const store = createDocumentStore(result);
    render(<DocumentView store={store} fileName="demo.mosa" />);
    expect(processing.count).toBe(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' }), {
      target: { value: '5000' },
    });
    expect(store.getRow('revenue', 'jan')?.amount).toBe(5000);
    expect(screen.getByText(/Values range from 1800 to 5000/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Document note' }), {
      target: { value: 'New note' },
    });
    expect(screen.getByText('Current note: New note')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show revenue chart' }));
    expect(screen.queryByRole('img')).toBeNull();
    expect(processing.count).toBe(1);
    expect(result.document.state?.note).toBe('First report');
  });

  it('updates anchors independently and processes changed text through the same URL/HTML/image policy', () => {
    const document = minimalDocument();
    const node = { ...nodeSamples.markdown, text: '**Before**' };
    const { container, rerender } = render(
      <MarkdownView node={node} document={document} anchorId="first" />,
    );
    rerender(<MarkdownView node={{ ...node }} document={{ ...document }} anchorId="second" />);
    expect(container.querySelector('#second strong')?.textContent).toBe('Before');
    expect(processing.count).toBe(1);
    rerender(
      <MarkdownView
        node={{
          ...node,
          text: '**After** [bad](javascript:alert) ![image](https://example.com/x) <script>bad()</script>',
        }}
        document={document}
        anchorId="second"
      />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('After');
    expect(container.querySelector('a, img, script')).toBeNull();
    expect(processing.count).toBe(2);
  });

  it('processes conditional Markdown only when mounted and releases reuse on unmount', () => {
    const store = storeFor({
      ...typedDocument,
      state: { ...typedDocument.state, visible: false },
      root: {
        ...typedDocument.root,
        children: [nodeSamples.toggle, { ...nodeSamples.when, children: [nodeSamples.markdown] }],
      },
    });
    render(<DocumentView store={store} fileName="conditional.mosa" />);
    expect(processing.count).toBe(0);
    const toggle = screen.getByRole('checkbox', { name: 'Visible' });
    fireEvent.click(toggle);
    expect(processing.count).toBe(1);
    fireEvent.click(toggle);
    expect(document.querySelector('.mosaic-markdown')).toBeNull();
    fireEvent.click(toggle);
    expect(processing.count).toBe(2);
  });

  it('starts fresh when replacing a document with the same Markdown text and node ID', () => {
    const document = minimalDocument();
    const value = { ...document, root: { ...document.root, children: [nodeSamples.markdown] } };
    const { rerender } = render(
      <DocumentView key="first" store={storeFor(value)} fileName="first.mosa" />,
    );
    expect(processing.count).toBe(1);
    rerender(<DocumentView key="second" store={storeFor(value)} fileName="second.mosa" />);
    expect(processing.count).toBe(2);
    expect(screen.getByText('second.mosa')).toBeTruthy();
  });
});
