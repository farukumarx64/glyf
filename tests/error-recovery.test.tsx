// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App.tsx';
import { MOSAIC_LIMITS } from '../src/core/limits.ts';
import { minimalDocument } from './fixtures.ts';

beforeEach(() =>
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  ),
);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openDemo() {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Demo' }));
  await screen.findByRole('textbox', { name: 'Document note' });
}

async function sendFile(file: File, route: 'picker' | 'drop' = 'picker') {
  await act(async () => {
    if (route === 'picker') {
      fireEvent.change(screen.getByLabelText('Choose a Mosaic file'), {
        target: { files: [file] },
      });
    } else {
      fireEvent.drop(screen.getByRole('main'), {
        dataTransfer: { files: [file], types: ['Files'] },
      });
    }
  });
}

function pendingFile() {
  const file = new File([], 'pending.mosa');
  let resolve!: (value: ArrayBuffer) => void;
  let reject!: (error: Error) => void;
  vi.spyOn(file, 'arrayBuffer').mockReturnValue(
    new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    }),
  );
  return {
    file,
    async finish(outcome: 'valid' | 'malformed' | 'unreadable') {
      await act(async () => {
        if (outcome === 'unreadable') reject(new Error('Private disk failure details'));
        else
          resolve(
            new TextEncoder().encode(outcome === 'valid' ? JSON.stringify(minimalDocument()) : '{')
              .buffer,
          );
      });
    },
  };
}

describe('viewer recovery during asynchronous reads', () => {
  it.each(['picker', 'drop'] as const)(
    'preserves edits made during a failed %s read, controls and local drafts, then permits retry',
    async (route) => {
      await openDemo();
      const note = screen.getByRole('textbox', { name: 'Document note' });
      const cell = screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
      fireEvent.change(cell, { target: { value: '5000' } });
      fireEvent.change(cell, { target: { value: '1e' } });
      const chart = screen.getByRole('img', { name: 'Revenue by month' });
      const geometry = chart.innerHTML;
      const pending = pendingFile();
      await sendFile(pending.file, route);
      expect(screen.getByText('Opening pending.mosa…')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Download' })).toHaveProperty('disabled', true);
      fireEvent.change(note, { target: { value: 'Edited during the read' } });
      await pending.finish('unreadable');
      const error = screen.getByRole('alert', { name: 'Could not open pending.mosa' });
      expect(document.activeElement).toBe(error);
      expect(error.textContent).toContain('The file could not be read. Choose it again to retry.');
      expect(error.textContent).not.toMatch(/Private disk|INVALID_JSON|JSON Pointer/);
      expect(screen.getByRole('textbox', { name: 'Document note' })).toBe(note);
      expect(note).toHaveProperty('value', 'Edited during the read');
      expect(screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' })).toBe(cell);
      expect(cell).toHaveProperty('value', '1e');
      expect(cell.getAttribute('aria-invalid')).toBe('true');
      expect(chart.innerHTML).toBe(geometry);
      expect(screen.getByText('Unsaved changes')).toBeTruthy();
      expect(screen.queryByText('Opening pending.mosa…')).toBeNull();
      expect(screen.getByRole('button', { name: 'Download' })).toHaveProperty('disabled', false);
      expect(window.confirm).not.toHaveBeenCalled();
      fireEvent.keyDown(cell, { key: 'Escape' });
      expect(cell).toHaveProperty('value', '5000');

      // Reuse the failed filename through the same entry route.
      await sendFile(new File([JSON.stringify(minimalDocument())], 'pending.mosa'), route);
      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('heading', { name: 'Minimal document' })).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Unsaved changes')).toBeNull();
      expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Preview' }));
    },
  );

  it.each(['valid', 'malformed', 'unreadable'] as const)(
    'ignores an older %s result after a newer oversized rejection',
    async (outcome) => {
      await openDemo();
      fireEvent.change(screen.getByRole('textbox', { name: 'Document note' }), {
        target: { value: 'Keep this note' },
      });
      fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
      const source = screen.getByRole('tabpanel', { name: 'Source' });
      const before = source.textContent;
      const pending = pendingFile();
      await sendFile(pending.file);
      const oversized = new File([], 'oversized.mosa');
      Object.defineProperty(oversized, 'size', { value: MOSAIC_LIMITS.fileBytes + 1 });
      const read = vi.spyOn(oversized, 'arrayBuffer');
      await sendFile(oversized, 'drop');
      expect(read).not.toHaveBeenCalled();
      const error = screen.getByRole('alert');
      expect(within(error).getByText('FILE_TOO_LARGE')).toBeTruthy();
      expect(document.activeElement).toBe(error);
      const diagnostic = error.textContent;
      await pending.finish(outcome);
      expect(screen.getByRole('alert')).toBe(error);
      expect(error.textContent).toBe(diagnostic);
      expect(document.activeElement).toBe(error);
      expect(screen.getByRole('tabpanel', { name: 'Source' })).toBe(source);
      expect(source.textContent).toBe(before);
      expect(screen.getByText('Unsaved changes')).toBeTruthy();
      expect(screen.queryByText('Opening pending.mosa…')).toBeNull();
      expect(screen.getByRole('button', { name: 'Download' })).toHaveProperty('disabled', false);
      expect(window.confirm).not.toHaveBeenCalled();
      await sendFile(new File([JSON.stringify(minimalDocument())], 'oversized.mosa'), 'drop');
      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('heading', { name: 'Minimal document' })).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it('keeps a clean document clean and preserves an uncommitted draft after a rejected import', async () => {
    await openDemo();
    const cell = screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
    fireEvent.change(cell, { target: { value: '-' } });
    await sendFile(new File(['{'], 'broken.mosa'));
    expect(screen.getByRole('alert', { name: 'Could not open broken.mosa' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' })).toBe(cell);
    expect(cell).toHaveProperty('value', '-');
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(window.confirm).not.toHaveBeenCalled();
    fireEvent.keyDown(cell, { key: 'Escape' });
    expect(cell).toHaveProperty('value', '1200');
  });
});
