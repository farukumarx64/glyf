import { createRoot } from 'react-dom/client';
import { DocumentView } from '../../src/app/DocumentView.tsx';
import { readMosaicFile } from '../../src/core/file.ts';
import { createDocumentStore } from '../../src/core/store.ts';
import { validateMosaic } from '../../src/core/validate.ts';
import '../../src/styles/global.css';

const root = createRoot(document.getElementById('root')!);
let key = 0;

async function frame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function settled(selector: string, expected: number) {
  const deadline = performance.now() + 10_000;
  do {
    await frame();
    if (document.querySelectorAll(selector).length === expected) {
      await frame();
      return;
    }
  } while (performance.now() < deadline);
  throw new Error(`Render did not settle: ${selector}`);
}

window.mosaicCoreBench = async (source: string) => {
  // File construction/transport and unmounting are outside the initial-render measurement.
  const file = new File([source], 'fixture.mosa');
  root.render(null);
  await settled('.document-view', 0);
  const start = performance.now();
  const read = await readMosaicFile(file);
  const readEnd = performance.now();
  if (!read.ok) throw new Error(JSON.stringify(read.errors));
  const valid = validateMosaic(read.value);
  const validationEnd = performance.now();
  if (!valid.ok) throw new Error(JSON.stringify(valid.errors));
  const store = createDocumentStore(valid);
  const storeEnd = performance.now();
  root.render(<DocumentView key={++key} store={store} fileName="fixture.mosa" />);
  await settled('.document-view', 1);
  const renderEnd = performance.now();
  if (
    document.querySelectorAll('tbody tr').length !==
    Math.min(100, valid.document.datasets!.values!.rows.length)
  ) {
    throw new Error('Unexpected initial table row count.');
  }
  return {
    readDecodeParseMs: readEnd - start,
    validationMs: validationEnd - readEnd,
    loadMs: validationEnd - start,
    storeMs: storeEnd - validationEnd,
    renderMs: renderEnd - storeEnd,
    validatedToRenderedMs: renderEnd - validationEnd,
  };
};

declare global {
  interface Window {
    mosaicCoreBench: (source: string) => Promise<{
      readDecodeParseMs: number;
      validationMs: number;
      loadMs: number;
      storeMs: number;
      renderMs: number;
      validatedToRenderedMs: number;
    }>;
  }
}
