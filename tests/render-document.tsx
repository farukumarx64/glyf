import { renderToStaticMarkup } from 'react-dom/server';
import { validateMosaic } from '../src/core/validate.ts';
import { NodeRenderer } from '../src/render/NodeRenderer.tsx';

export function renderDocument(value: unknown): string {
  const result = validateMosaic(value);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return renderToStaticMarkup(<NodeRenderer document={result.document} />);
}
