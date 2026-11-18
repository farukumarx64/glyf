// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import demoSource from '../examples/mosaic-demo.mosa?raw';
import { App } from '../src/app/App.tsx';
import { downloadMosaic } from '../src/app/download.ts';
import { MOSAIC_LIMITS } from '../src/core/limits.ts';
import { parseMosaic } from '../src/core/parse.ts';
import { MosaicSerializationError } from '../src/core/serialize.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { minimalDocument, nodeSamples } from './fixtures.ts';

const blobs: Blob[] = [];
const links: { name: string; url: string; connected: boolean }[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  blobs.length = 0;
  links.length = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob as Blob);
    return 'blob:mosaic-test-' + blobs.length;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    links.push({ name: this.download, url: this.href, connected: this.isConnected });
  });
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function choose(file: File) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Choose a Mosaic file'), { target: { files: [file] } });
  });
}

async function openDemo() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Open Demo' }));
  });
}

function download() {
  fireEvent.click(screen.getByRole('button', { name: 'Download' }));
}

// Measure with the native UTF-8 encoder independently of the serializer's size guard.
function sizedDocument(bytes: number) {
  const doc = {
    ...minimalDocument(),
    state: { padding: '', note: '' },
    root: { ...minimalDocument().root, children: [nodeSamples.input] },
  };
  const available = bytes - new TextEncoder().encode(JSON.stringify(doc, null, 2) + '\n').length;
  doc.state.padding = 'é'.repeat(Math.floor(available / 2)) + 'a'.repeat(available % 2);
  return doc;
}

describe('Mosaic download', () => {
  it('writes formatted UTF-8 JSON, creates a temporary local link and releases its URL after use', async () => {
    const doc = { ...minimalDocument(), state: { note: '雪 😀\nquoted "text"', empty: null } };
    const original = structuredClone(doc);
    downloadMosaic(doc, 'report.mosa');
    expect(blobs).toHaveLength(1);
    expect(blobs[0]?.type).toBe('application/json');
    const text = JSON.stringify(doc, null, 2) + '\n';
    expect(new Uint8Array(await blobs[0]!.arrayBuffer())).toEqual(new TextEncoder().encode(text));
    expect(links).toEqual([{ name: 'report.mosa', url: 'blob:mosaic-test-1', connected: true }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:mosaic-test-1');
    expect(doc).toEqual(original);
  });

  it.each([
    ['report.MOSA', 'report.mosa'],
    ['report', 'report.mosa'],
    ['report.json', 'report.json.mosa'],
    ['folder/notes.mosa', 'notes.mosa'],
    ['folder\\notes.mosa', 'notes.mosa'],
    ['', 'document.mosa'],
  ])('suggests a .mosa filename for %j', (input, expected) => {
    downloadMosaic(minimalDocument(), input);
    expect(links[0]?.name).toBe(expected);
  });

  it('allows exactly 5 MiB of formatted UTF-8 output', async () => {
    const doc = sizedDocument(MOSAIC_LIMITS.fileBytes);
    downloadMosaic(doc, 'exact.mosa');
    expect(blobs[0]?.size).toBe(MOSAIC_LIMITS.fileBytes);
    expect(parseMosaic(await blobs[0]!.text())).toEqual({ ok: true, document: doc });
  });

  it('rejects one extra UTF-8 byte before creating a URL or starting a download', () => {
    const doc = sizedDocument(MOSAIC_LIMITS.fileBytes + 1);
    expect(validateMosaic(doc).ok).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(doc)).length).toBeLessThan(
      MOSAIC_LIMITS.fileBytes,
    );
    expect(() => downloadMosaic(doc, 'over.mosa')).toThrow(MosaicSerializationError);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(links).toEqual([]);
  });

  it('revalidates the full document and retains the validator diagnostic', () => {
    const doc = {
      ...minimalDocument(),
      root: { ...minimalDocument().root, children: [nodeSamples.input] },
    };
    const validation = validateMosaic(doc);
    expect(validation.ok).toBe(false);
    try {
      downloadMosaic(doc, 'invalid.mosa');
      throw new Error('Expected validation failure');
    } catch (error) {
      expect(error).toBeInstanceOf(MosaicSerializationError);
      expect((error as MosaicSerializationError).errors).toEqual(
        !validation.ok && validation.errors,
      );
    }
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(links).toEqual([]);
  });

  it('cleans up the link and URL even when the browser rejects the click', () => {
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    expect(() => downloadMosaic(minimalDocument(), 'report.mosa')).toThrow('blocked');
    expect(document.querySelector('a[download]')).toBeNull();
    vi.runOnlyPendingTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:mosaic-test-1');
  });
});

describe('viewer Download action', () => {
  it('is disabled before a document is open and during replacement, then exports the replacement', async () => {
    render(<App />);
    const button = screen.getByRole('button', { name: 'Download' });
    expect(button).toHaveProperty('disabled', true);
    download();
    expect(links).toEqual([]);
    await openDemo();
    expect(button).toHaveProperty('disabled', false);
    const doc = minimalDocument();
    const file = new File([JSON.stringify(doc)], 'replacement.mosa');
    let release!: (value: ArrayBuffer) => void;
    vi.spyOn(file, 'arrayBuffer').mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await choose(file);
    expect(button).toHaveProperty('disabled', true);
    download();
    expect(links).toEqual([]);
    await act(async () => {
      release(new TextEncoder().encode(JSON.stringify(doc)).buffer);
    });
    expect(button).toHaveProperty('disabled', false);
    download();
    expect(links[0]?.name).toBe('replacement.mosa');
    expect(JSON.parse(await blobs[0]!.text())).toEqual(doc);
  });

  it('exports current dataset and state edits, hidden content and last valid numeric values in either tab', async () => {
    render(<App />);
    await openDemo();
    fireEvent.change(screen.getByRole('textbox', { name: 'Document note' }), {
      target: { value: '雪 😀\nUpdated' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show revenue chart' }));
    const cell = screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
    fireEvent.change(cell, { target: { value: '5000' } });
    fireEvent.change(cell, { target: { value: '1e' } });
    download();
    const expected = JSON.parse(demoSource);
    expected.state.note = '雪 😀\nUpdated';
    expected.state.showChart = false;
    expected.datasets.revenue.rows[0].amount = 5000;
    expect(await blobs[0]!.text()).toBe(JSON.stringify(expected, null, 2) + '\n');
    expect(cell).toHaveProperty('value', '1e');
    expect(screen.getByRole('alert').textContent).toContain('finite decimal number');
    fireEvent.change(screen.getByRole('textbox', { name: 'Document note' }), {
      target: { value: 'Latest' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    download();
    expected.state.note = 'Latest';
    expect(await blobs[1]!.text()).toBe(JSON.stringify(expected, null, 2) + '\n');
    expect(screen.getByRole('tab', { name: 'Source', selected: true })).toBeTruthy();
    expect(JSON.parse(demoSource).datasets.revenue.rows[0].amount).toBe(1200);
  });

  it('shows export size errors, preserves all edits and permits a corrected retry', async () => {
    render(<App />);
    const doc = sizedDocument(MOSAIC_LIMITS.fileBytes);
    await choose(new File([JSON.stringify(doc)], 'limit.mosa'));
    const note = screen.getByRole('textbox', { name: 'Note' });
    fireEvent.change(note, { target: { value: 'é' } });
    download();
    const alert = screen.getByRole('alert');
    expect(within(alert).getByRole('heading').textContent).toBe('Could not download limit.mosa');
    expect(within(alert).getByText('FILE_TOO_LARGE')).toBeTruthy();
    expect(within(alert).getByText('""')).toBeTruthy();
    expect(alert.textContent).toContain('5242880 UTF-8 bytes');
    expect(document.activeElement).toBe(alert);
    expect(note).toHaveProperty('value', 'é');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    expect(JSON.parse(screen.getByRole('tabpanel').textContent!)).toEqual({
      ...doc,
      state: { ...doc.state, note: 'é' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), { target: { value: '' } });
    download();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(blobs[0]?.size).toBe(MOSAIC_LIMITS.fileBytes);
    expect(JSON.parse(await blobs[0]!.text())).toEqual(doc);
  });

  it('blocks a compact import whose formatted export is too large without changing Source', async () => {
    render(<App />);
    const doc = sizedDocument(MOSAIC_LIMITS.fileBytes + 1);
    await choose(new File([JSON.stringify(doc)], 'compact.mosa'));
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    const source = screen.getByRole('tabpanel');
    const before = source.textContent;
    download();
    expect(screen.getByRole('alert').textContent).toContain('FILE_TOO_LARGE');
    expect(screen.getByRole('tab', { name: 'Source', selected: true })).toBeTruthy();
    expect(source.textContent).toBe(before);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('keeps the last open document downloadable after an import failure and handles browser errors separately', async () => {
    render(<App />);
    await openDemo();
    await choose(new File(['{'], 'bad.mosa'));
    expect(screen.getByRole('alert').textContent).toContain('Could not open bad.mosa');
    expect(screen.getByRole('button', { name: 'Download' })).toHaveProperty('disabled', false);
    vi.mocked(URL.createObjectURL).mockImplementationOnce(() => {
      throw new Error('browser failure');
    });
    download();
    expect(screen.getByRole('alert').textContent).toContain(
      'The download could not be started. Try again.',
    );
    expect(screen.getByRole('alert').textContent).not.toContain('INVALID_JSON');
    expect(screen.getByRole('textbox', { name: 'Document note' })).toHaveProperty(
      'value',
      'First report',
    );
    download();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(links[0]?.name).toBe('mosaic-demo.mosa');
    expect(JSON.parse(await blobs[0]!.text())).toEqual(JSON.parse(demoSource));
  });
});
