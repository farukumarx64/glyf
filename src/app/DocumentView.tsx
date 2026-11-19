import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import type { DocumentStore } from '../core/store.ts';
import { NodeRenderer } from '../render/NodeRenderer.tsx';

const views = ['Preview', 'Source'] as const;
type View = (typeof views)[number];

export const DocumentView = memo(function DocumentView({
  store,
  fileName,
}: {
  store: DocumentStore;
  fileName: string;
}) {
  const document = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const dirty = useSyncExternalStore(store.subscribe, store.isDirty);
  const [view, setView] = useState<View>('Preview');
  const previewTab = useRef<HTMLButtonElement>(null);
  const previewPanel = useRef<HTMLDivElement>(null);
  const focusedPreview = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previewTab.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (view !== 'Preview') {
      focusedPreview.current = null;
      return;
    }
    const panel = previewPanel.current;
    // A valid edit can remove its own control through `when`. Keep keyboard
    // navigation in the document, without moving focus from a surviving target.
    if (focusedPreview.current && !focusedPreview.current.isConnected) {
      focusedPreview.current = null;
      if (panel && panel.ownerDocument.activeElement === panel.ownerDocument.body) panel.focus();
    }
  }, [document, view]);

  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    let next: View;
    switch (event.key) {
      case 'Home':
        next = 'Preview';
        break;
      case 'End':
        next = 'Source';
        break;
      case 'ArrowLeft':
      case 'ArrowRight':
        next = view === 'Preview' ? 'Source' : 'Preview';
        break;
      default:
        return;
    }
    event.preventDefault();
    setView(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`#tab-${next}`)?.focus();
  }

  return (
    <section className="document-view" aria-labelledby="document-title">
      <h1 id="document-title">{document.meta.title.trim() || fileName}</h1>
      <p className="file-name" aria-live="polite" aria-atomic="true">
        {fileName}
        {dirty && <span className="unsaved-status">Unsaved changes</span>}
      </p>
      <div className="document-sheet">
        <div className="view-tabs" role="tablist" aria-label="Document view" onKeyDown={moveTab}>
          {views.map((name) => (
            <button
              key={name}
              ref={name === 'Preview' ? previewTab : undefined}
              type="button"
              id={`tab-${name}`}
              role="tab"
              aria-selected={name === view}
              aria-controls={`panel-${name}`}
              tabIndex={name === view ? 0 : -1}
              onClick={() => setView(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <div
          ref={previewPanel}
          className="preview-panel"
          role="tabpanel"
          id="panel-Preview"
          aria-labelledby="tab-Preview"
          hidden={view !== 'Preview'}
          tabIndex={0}
          onFocusCapture={(event) => {
            focusedPreview.current = event.target;
          }}
        >
          {view === 'Preview' && (
            <NodeRenderer
              document={document}
              onCellEdit={store.updateCell}
              onStateEdit={store.updateState}
            />
          )}
        </div>
        <div
          className="source-panel"
          role="tabpanel"
          id="panel-Source"
          aria-labelledby="tab-Source"
          hidden={view !== 'Source'}
          tabIndex={0}
        >
          {view === 'Source' && (
            <pre>
              <code>{JSON.stringify(document, null, 2) + '\n'}</code>
            </pre>
          )}
        </div>
      </div>
    </section>
  );
});
