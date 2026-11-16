import { useRef, useState, type DragEvent } from 'react';
import demoSource from '../../examples/mosaic-demo.mosa?raw';
import { readMosaicFile } from '../core/file.ts';
import type { MosaicDocument } from '../core/types.ts';
import { validateMosaic } from '../core/validate.ts';
import { DocumentView } from './DocumentView.tsx';
import { ErrorPanel, type OpenFailure } from './ErrorPanel.tsx';

type OpenDocument = { document: MosaicDocument; name: string; request: number };
type Notice = { kind: 'loading'; name: string } | { kind: 'error'; failure: OpenFailure };

export function App() {
  const [opened, setOpened] = useState<OpenDocument | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const latestRequest = useRef(0);
  const dragDepth = useRef(0);

  async function openFile(file: File) {
    const request = ++latestRequest.current;
    setNotice({ kind: 'loading', name: file.name });
    let source: Awaited<ReturnType<typeof readMosaicFile>>;
    try {
      source = await readMosaicFile(file);
    } catch {
      if (request === latestRequest.current) {
        setNotice({
          kind: 'error',
          failure: {
            name: file.name,
            message: 'The file could not be read. Choose it again to retry.',
          },
        });
      }
      return;
    }

    if (request !== latestRequest.current) return;
    const result = source.ok ? validateMosaic(source.value) : source;
    if (!result.ok) {
      setNotice({ kind: 'error', failure: { name: file.name, errors: result.errors } });
      return;
    }
    setOpened({ document: result.document, name: file.name, request });
    setNotice(null);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = event.dataTransfer.files;
    if (files.length > 1) {
      ++latestRequest.current;
      setNotice({ kind: 'error', failure: { message: 'Drop one Mosaic document at a time.' } });
    } else if (files[0]) {
      void openFile(files[0]);
    }
  }

  return (
    <div
      className="viewer"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files')
          ? 'copy'
          : 'none';
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={drop}
    >
      <header className="viewer-header">
        <div className="viewer-bar">
          <div className="brand">
            <span className="mosaic-mark" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            Mosaic
          </div>
          <div className="file-actions">
            <button
              type="button"
              onClick={() => void openFile(new File([demoSource], 'mosaic-demo.mosa'))}
            >
              Open Demo
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={() => picker.current?.click()}
            >
              Open File
            </button>
            <input
              ref={picker}
              type="file"
              accept=".mosa"
              aria-label="Choose a Mosaic file"
              hidden
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void openFile(file);
              }}
            />
          </div>
        </div>
      </header>
      <main className="workspace">
        {notice?.kind === 'loading' && (
          <p role="status" className="loading">
            Opening {notice.name}…
          </p>
        )}
        {notice?.kind === 'error' && <ErrorPanel failure={notice.failure} />}
        {opened ? (
          <DocumentView key={opened.request} document={opened.document} fileName={opened.name} />
        ) : (
          <section className="start-screen">
            <h1>Open a document</h1>
            <p>Preview a Mosaic document and inspect its source. Your file stays on this device.</p>
            <button type="button" className="drop-target" onClick={() => picker.current?.click()}>
              <span className="file-symbol" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <strong>Drop a .mosa file here</strong>
              <span>or choose a file · up to 5 MiB</span>
            </button>
          </section>
        )}
      </main>
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <strong>Drop to open document</strong>
        </div>
      )}
    </div>
  );
}
