// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOSAIC_LIMITS } from '../src/core/limits.ts';
import { serializeMosaic } from '../src/core/serialize.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { NodeRenderer } from '../src/render/NodeRenderer.tsx';
import { MARKDOWN_RENDER_DEPTH } from '../src/render/markdown-depth.ts';
import { minimalDocument, nodeSamples } from './fixtures.ts';
import { nestedMarkdown } from './security-fixtures.ts';

afterEach(cleanup);

function documentWithMarkdown(text: string) {
  const doc = minimalDocument();
  return {
    ...doc,
    root: { ...doc.root, children: [{ ...nodeSamples.markdown, text }, nodeSamples.heading] },
  };
}

describe('Markdown renderer failure isolation', () => {
  it.each([0, 1])('checks the inclusive Markdown rendering depth with %i extra levels', (extra) => {
    // Quotes are followed by a paragraph and text leaf in the Markdown AST.
    const text = '> '.repeat(MARKDOWN_RENDER_DEPTH - 2 + extra) + 'Readable';
    const { container } = render(<NodeRenderer document={documentWithMarkdown(text)} />, {
      onCaughtError: vi.fn(),
    });
    if (extra === 0) {
      expect(container.querySelectorAll('blockquote')).toHaveLength(MARKDOWN_RENDER_DEPTH - 2);
      expect(screen.queryByRole('note')).toBeNull();
    } else {
      expect(container.querySelectorAll('blockquote')).toHaveLength(0);
      expect(container.querySelector('pre')?.textContent).toBe(text);
      expect(screen.getByRole('note')).toBeTruthy();
    }
  });

  it.each(nestedMarkdown)(
    'keeps valid deeply nested $name readable and leaves sibling nodes usable',
    ({ text }) => {
      expect(text.length).toBe(MOSAIC_LIMITS.markdownCharacters);
      const value = documentWithMarkdown(text);
      const validated = validateMosaic(value);
      if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
      const before = serializeMosaic(validated.document);
      const caught = vi.fn();
      const { container, rerender } = render(<NodeRenderer document={validated.document} />, {
        onCaughtError: caught,
      });
      expect(screen.getByRole('heading', { name: 'Heading' })).toBeTruthy();
      expect(screen.getByRole('note').textContent).toContain('Showing the original text');
      expect(container.querySelector('.mosaic-markdown pre')?.textContent).toBe(text);
      expect(container.querySelector('img, script, iframe')).toBeNull();
      expect(caught).toHaveBeenCalled();
      expect(serializeMosaic(validated.document)).toBe(before);

      // A replacement with the same node ID must get a fresh rendering attempt.
      rerender(<NodeRenderer document={documentWithMarkdown('**Recovered**')} />);
      expect(container.querySelector('strong')?.textContent).toBe('Recovered');
      expect(screen.queryByRole('note')).toBeNull();
    },
  );
});
