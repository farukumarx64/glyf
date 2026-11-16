// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import demoSource from '../examples/mosaic-demo.mosa?raw';
import missingBinding from '../examples/invalid/missing-binding.mosa?raw';
import { App } from '../src/app/App.tsx';
import { DocumentView } from '../src/app/DocumentView.tsx';
import { MOSAIC_LIMITS } from '../src/core/limits.ts';
import { parseMosaic } from '../src/core/parse.ts';
import { createDocumentStore } from '../src/core/store.ts';
import { minimalDocument } from './fixtures.ts';

afterEach(cleanup);

function choose(...files: File[]) {
  fireEvent.change(screen.getByLabelText('Choose a Mosaic file'), { target: { files } });
}

function drop(...files: File[]) {
  fireEvent.drop(screen.getByRole('main'), { dataTransfer: { files, types: ['Files'] } });
}

async function openDemo() {
  fireEvent.click(screen.getByRole('button', { name: 'Open Demo' }));
  return screen.findByRole('tab', { name: 'Preview', selected: true });
}

describe('viewer file workflow', () => {
  it('refreshes the open Source tab when the document store commits an edit', () => {
    const opened = parseMosaic(demoSource);
    if (!opened.ok) throw new Error(JSON.stringify(opened.errors));
    const store = createDocumentStore(opened);
    render(<DocumentView store={store} fileName="mosaic-demo.mosa" />);
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    const panel = screen.getByRole('tabpanel', { name: 'Source' });
    expect(panel.textContent).toContain('"amount": 1200');
    act(() => {
      store.updateCell('revenueTable', 'jan', 'amount', 1500);
    });
    expect(panel.textContent).toBe(JSON.stringify(store.getSnapshot(), null, 2) + '\n');
    expect(panel.textContent).toContain('"amount": 1500');
  });

  it('opens the bundled reference demo and switches accessible tabs by keyboard and click', async () => {
    render(<App />);
    expect(screen.queryByRole('tablist')).toBeNull();
    const preview = await openDemo();
    expect(document.activeElement).toBe(preview);
    const panel = screen.getByRole('tabpanel', { name: 'Preview' });
    expect(within(panel).getByRole('textbox', { name: 'Document note' })).toHaveProperty(
      'value',
      'First report',
    );
    const source = screen.getByRole('tab', { name: 'Source' });
    fireEvent.keyDown(preview, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(source);
    expect(screen.getByRole('tabpanel', { name: 'Source' }).textContent).toBe(
      JSON.stringify(JSON.parse(demoSource), null, 2) + '\n',
    );
    fireEvent.keyDown(source, { key: 'Home' });
    expect(document.activeElement).toBe(preview);
    fireEvent.click(source);
    fireEvent.click(preview);
    expect(screen.getByRole('tabpanel').id).toBe(preview.getAttribute('aria-controls'));
  });

  it('routes both choose actions to the file picker and tolerates cancellation', () => {
    render(<App />);
    const picker = screen.getByLabelText<HTMLInputElement>('Choose a Mosaic file');
    const click = vi.spyOn(picker, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Open File' }));
    fireEvent.click(screen.getByRole('button', { name: /Drop a .mosa file here/ }));
    expect(click).toHaveBeenCalledTimes(2);
    choose();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('validates selected file contents and opens a replacement in Preview', async () => {
    render(<App />);
    await openDemo();
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    const doc = minimalDocument();
    choose(
      new File(['\uFEFF' + JSON.stringify(doc)], 'report.mosa', {
        type: 'application/octet-stream',
      }),
    );
    await screen.findByRole('heading', { name: doc.meta.title });
    expect(screen.getByRole('tab', { name: 'Preview', selected: true })).toBeTruthy();
    expect(screen.getByText('report.mosa')).toBeTruthy();
    expect(screen.queryByText('First report')).toBeNull();
  });

  it('accepts a drop on the workspace and displays JSON containing markup as text', async () => {
    render(<App />);
    const doc = { ...minimalDocument(), state: { note: '<em>literal</em>' } };
    const target = screen.getByRole('main');
    const transfer = { types: ['Files'], files: [new File([JSON.stringify(doc)], 'dropped.mosa')] };
    fireEvent.dragEnter(target, { dataTransfer: transfer });
    expect(screen.getByText('Drop to open document')).toBeTruthy();
    expect(fireEvent.dragOver(target, { dataTransfer: transfer })).toBe(false);
    drop(...transfer.files);
    await screen.findByRole('heading', { name: doc.meta.title });
    expect(screen.queryByText('Drop to open document')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    const source = screen.getByRole('tabpanel');
    expect(source.textContent).toContain('"note": "<em>literal</em>"');
    expect(source.querySelector('em')).toBeNull();
  });

  it('keeps the last valid Source visible on failure and clears the error on a successful retry', async () => {
    render(<App />);
    await openDemo();
    fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
    choose(new File([missingBinding], 'notes.mosa'));
    const panel = await screen.findByRole('alert');
    expect(within(panel).getByText('State key "absent" is not declared.')).toBeTruthy();
    expect(within(panel).getByText('INVALID_BINDING')).toBeTruthy();
    expect(within(panel).getByText('/root/children/0/children/0/bind')).toBeTruthy();
    expect(screen.getByRole('tabpanel', { name: 'Source' }).textContent).toContain(
      '"id": "sample_overview"',
    );
    choose(new File([JSON.stringify(minimalDocument())], 'notes.mosa'));
    await screen.findByRole('heading', { name: 'Minimal document' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['bad JSON', new File(['{'], 'bad.mosa'), 'INVALID_JSON', '""'],
    ['invalid encoding', new File([new Uint8Array([255])], 'bad.mosa'), 'INVALID_UTF8', '""'],
    [
      'unsupported version',
      new File(['{"mosaic":"2.0"}'], 'bad.mosa'),
      'UNSUPPORTED_VERSION',
      '/mosaic',
    ],
    [
      'duplicate property',
      new File(['{"mosaic":"0.1.0","a/b":1,"a/b":2}'], 'bad.mosa'),
      'INVALID_JSON',
      '/a~1b',
    ],
  ] as const)(
    'shows the original diagnostic and pointer for %s',
    async (_name, file, code, path) => {
      render(<App />);
      drop(file);
      const alert = await screen.findByRole('alert');
      expect(within(alert).getByText(code)).toBeTruthy();
      expect(within(alert).getByText(path)).toBeTruthy();
      expect(screen.queryByRole('tablist')).toBeNull();
    },
  );

  it('blocks an oversized file before reading its bytes', async () => {
    render(<App />);
    const file = new File([], 'large.mosa');
    Object.defineProperty(file, 'size', { value: MOSAIC_LIMITS.fileBytes + 1 });
    const read = vi.spyOn(file, 'arrayBuffer');
    choose(file);
    expect(within(await screen.findByRole('alert')).getByText('FILE_TOO_LARGE')).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
  });

  it('shows full Source for a valid compact file even when indentation exceeds the export limit', async () => {
    render(<App />);
    const doc = { ...minimalDocument(), state: { note: '' } };
    doc.state.note = 'a'.repeat(MOSAIC_LIMITS.fileBytes - JSON.stringify(doc).length);
    choose(new File([JSON.stringify(doc)], 'limit.mosa'));
    fireEvent.click(await screen.findByRole('tab', { name: 'Source' }));
    const formatted = screen.getByRole('tabpanel').textContent!;
    expect(formatted.length).toBeGreaterThan(MOSAIC_LIMITS.fileBytes);
    expect(JSON.parse(formatted)).toEqual(doc);
  });

  it('handles unreadable files, multiple files, and non-file drops', async () => {
    render(<App />);
    fireEvent.drop(screen.getByRole('main'), {
      dataTransfer: { types: ['text/plain'], files: [] },
    });
    expect(screen.queryByRole('alert')).toBeNull();
    const file = new File([], 'unreadable.mosa');
    const read = vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('read failure'));
    drop(file, file);
    expect(screen.getByRole('alert').textContent).toContain('one Mosaic document');
    expect(read).not.toHaveBeenCalled();
    choose(file);
    await screen.findByText('The file could not be read. Choose it again to retry.');
    expect(screen.getByRole('alert').textContent).toContain(file.name);
    expect(screen.queryByText('INVALID_JSON')).toBeNull();
  });

  it.each(['success', 'failure'])(
    'ignores a late file %s after a newer demo open',
    async (outcome) => {
      render(<App />);
      const file = new File([JSON.stringify(minimalDocument())], 'slow.mosa');
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const bytes = file.arrayBuffer();
      vi.spyOn(file, 'arrayBuffer').mockImplementation(async () => {
        await gate;
        if (outcome === 'failure') throw new Error('old read failed');
        return bytes;
      });
      choose(file);
      expect(screen.getByRole('status').textContent).toContain('slow.mosa');
      await openDemo();
      await act(async () => {
        release();
      });
      expect(screen.getByRole('heading', { name: 'Mosaic Demo' })).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );
});
