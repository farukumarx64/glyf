/** Browser-only observer module injected by the runner, never imported by the shipped app. */
export function installViewerBenchmark(sources: { name: string; source: string }[]) {
  const files = new Map(
    sources.map(({ name, source }) => [
      name,
      {
        file: new File([source], `${name}.mosa`, { type: 'application/json' }),
        title: (JSON.parse(source) as { meta: { title: string } }).meta.title,
      },
    ]),
  );
  async function frame() {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  async function measure(action: () => void, complete: () => boolean) {
    const start = performance.now();
    const domMs = await new Promise<number>((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (complete()) {
          observer.disconnect();
          clearTimeout(timeout);
          resolve(performance.now() - start);
        }
      });
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Viewer benchmark action did not complete.'));
      }, 10_000);
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      action();
    });
    // Two animation frames allow style/layout and a paint opportunity between callbacks.
    // This is not a GPU/compositor presentation timestamp.
    await frame();
    await frame();
    const paintMs = performance.now() - start;
    if (document.querySelector('[role="alert"]')) throw new Error('Unexpected viewer error.');
    return { domMs, paintMs };
  }
  window.mosaicViewerBench = {
    async open(name: string) {
      const selected = files.get(name)!;
      const previous = document.querySelector('.document-view');
      const picker = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      const transfer = new DataTransfer();
      transfer.items.add(selected.file);
      picker.files = transfer.files;
      return measure(
        () => picker.dispatchEvent(new Event('change', { bubbles: true })),
        () =>
          document.querySelector('.document-view') !== previous &&
          document.querySelector('#document-title')?.textContent === selected.title,
      );
    },
    async edit(value: number) {
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Amount, row r0"]')!;
      if (!input) throw new Error('Editable benchmark cell is missing.');
      const charts = Array.from(document.querySelectorAll('.mosaic-chart'));
      const before = charts.map((chart) => chart.querySelector('svg')!.innerHTML);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      return measure(
        () => {
          setter.call(input, String(value));
          input.dispatchEvent(new Event('input', { bubbles: true }));
        },
        () =>
          charts.length === 2 &&
          charts.every(
            (chart, i) =>
              chart.querySelector('p')!.textContent!.includes(`to ${value}.`) &&
              chart.querySelector('svg')!.innerHTML !== before[i],
          ),
      );
    },
    async nextRows() {
      const button = Array.from(document.querySelectorAll('button')).find((item) =>
        /^Show 100 more rows$/.test(item.textContent ?? ''),
      );
      if (!button) throw new Error('Progressive table button is missing.');
      const before = document.querySelectorAll('tbody tr').length;
      return measure(
        () => button.click(),
        () => document.querySelectorAll('tbody tr').length === before + 100,
      );
    },
    async settle() {
      await frame();
      await frame();
    },
    counts() {
      return {
        elements: document.querySelectorAll('*').length,
        tableRows: document.querySelectorAll('tbody tr').length,
        barPoints: document.querySelectorAll('.mosaic-chart-bar').length,
        linePoints: document.querySelectorAll('.mosaic-chart-point').length,
      };
    },
  };
}

window.installMosaicViewerBenchmark = installViewerBenchmark;

declare global {
  interface Window {
    installMosaicViewerBenchmark: typeof installViewerBenchmark;
    mosaicViewerBench: {
      open(name: string): Promise<{ domMs: number; paintMs: number }>;
      edit(value: number): Promise<{ domMs: number; paintMs: number }>;
      nextRows(): Promise<{ domMs: number; paintMs: number }>;
      settle(): Promise<void>;
      counts(): { elements: number; tableRows: number; barPoints: number; linePoints: number };
    };
  }
}
