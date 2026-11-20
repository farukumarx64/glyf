/** Measurement-only instrumentation; never imported by the application. */
export function installMemoryObserver(ids: string[]) {
  const watchedIds = new Set(ids);
  const originalParse = JSON.parse;
  let documents: WeakRef<object>[] = [];
  let views: WeakRef<Element>[] = [];
  let documentsSeen = 0;
  let viewsSeen = 0;
  JSON.parse = (...args: Parameters<typeof JSON.parse>) => {
    const value: unknown = originalParse(...args);
    if (
      value &&
      typeof value === 'object' &&
      'mosaic' in value &&
      'id' in value &&
      typeof value.id === 'string' &&
      watchedIds.has(value.id)
    ) {
      documents.push(new WeakRef(value));
      documentsSeen++;
    }
    return value;
  };
  window.mosaicMemoryObserver = {
    captureView() {
      const view = document.querySelector('.document-view');
      if (!view) throw new Error('Expected a rendered fixture document.');
      views.push(new WeakRef(view));
      viewsSeen++;
    },
    counts() {
      // Prune dead weak references so the observer itself does not grow per cycle.
      // Call after GC, in a separate browser task from any prior deref operation.
      documents = documents.filter((ref) => ref.deref() !== undefined);
      views = views.filter((ref) => ref.deref() !== undefined);
      return {
        documentsSeen,
        viewsSeen,
        liveDocuments: documents.length,
        liveViews: views.length,
      };
    },
  };
}

window.installMosaicMemoryObserver = installMemoryObserver;

declare global {
  interface Window {
    installMosaicMemoryObserver: typeof installMemoryObserver;
    mosaicMemoryObserver: {
      captureView(): void;
      counts(): {
        documentsSeen: number;
        viewsSeen: number;
        liveDocuments: number;
        liveViews: number;
      };
    };
  }
}
