// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App.tsx';
import { downloadMosaic } from '../src/app/download.ts';
import { minimalDocument } from './fixtures.ts';

vi.mock('../src/app/download.ts', () => ({ downloadMosaic: vi.fn() }));

beforeEach(() => {
  vi.stubGlobal(
    'confirm',
    vi.fn(() => false),
  );
  vi.mocked(downloadMosaic).mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function file() {
  return new File([JSON.stringify(minimalDocument())], 'replacement.mosa');
}

async function replace(route: 'demo' | 'picker' | 'drop', incoming = file()) {
  await act(async () => {
    if (route === 'demo') fireEvent.click(screen.getByRole('button', { name: 'Open Demo' }));
    else if (route === 'picker')
      fireEvent.change(screen.getByLabelText('Choose a Mosaic file'), {
        target: { files: [incoming] },
      });
    else
      fireEvent.drop(screen.getByRole('main'), {
        dataTransfer: { files: [incoming], types: ['Files'] },
      });
  });
}

async function openEditedDemo() {
  render(<App />);
  await replace('demo');
  fireEvent.change(screen.getByRole('textbox', { name: 'Document note' }), {
    target: { value: 'Keep my note' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' }), {
    target: { value: '5000' },
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show revenue chart' }));
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
}

function delayedFile() {
  const incoming = file();
  let finish!: (value: ArrayBuffer) => void;
  vi.spyOn(incoming, 'arrayBuffer').mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  return {
    incoming,
    async release() {
      await act(async () => {
        finish(new TextEncoder().encode(JSON.stringify(minimalDocument())).buffer);
      });
    },
  };
}

describe('unsaved replacement protection', () => {
  it.each(['demo', 'picker', 'drop'] as const)(
    'cancels %s replacement while preserving Source, edits and dirty status',
    async (route) => {
      await openEditedDemo();
      fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
      const source = screen.getByRole('tabpanel');
      const before = source.textContent;
      const viewer = document.querySelector('.viewer')!;
      const theme = viewer.getAttribute('data-accent');
      await replace(route);
      expect(window.confirm).toHaveBeenCalledExactlyOnceWith(
        'This document has unsaved changes. Replace it and discard those changes?',
      );
      expect(screen.getByRole('tabpanel')).toBe(source);
      expect(source.textContent).toBe(before);
      expect(screen.getByRole('tab', { name: 'Source', selected: true })).toBeTruthy();
      expect(screen.getByText('mosaic-demo.mosa')).toBeTruthy();
      expect(screen.getByText('Unsaved changes')).toBeTruthy();
      expect(viewer.getAttribute('data-accent')).toBe(theme);
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.getByRole('button', { name: 'Download' })).toHaveProperty('disabled', false);
    },
  );

  it.each(['demo', 'picker', 'drop'] as const)(
    'accepts %s replacement with a fresh clean store and Preview',
    async (route) => {
      await openEditedDemo();
      fireEvent.click(screen.getByRole('tab', { name: 'Source' }));
      vi.mocked(window.confirm).mockReturnValue(true);
      await replace(route);
      expect(window.confirm).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('tab', { name: 'Preview', selected: true })).toBeTruthy();
      expect(screen.queryByText('Unsaved changes')).toBeNull();
      if (route === 'demo') {
        expect(screen.getByRole('textbox', { name: 'Document note' })).toHaveProperty(
          'value',
          'First report',
        );
        expect(screen.getByRole('checkbox', { name: 'Show revenue chart' })).toHaveProperty(
          'checked',
          true,
        );
        expect(screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' })).toHaveProperty(
          'value',
          '1200',
        );
      } else expect(screen.getByRole('heading', { name: 'Minimal document' })).toBeTruthy();
      await replace('demo');
      expect(window.confirm).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the same controls and an invalid local draft when replacement is cancelled', async () => {
    await openEditedDemo();
    const note = screen.getByRole('textbox', { name: 'Document note' });
    const cell = screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
    fireEvent.change(cell, { target: { value: '1e' } });
    await replace('demo');
    expect(screen.getByRole('textbox', { name: 'Document note' })).toBe(note);
    expect(note).toHaveProperty('value', 'Keep my note');
    expect(screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' })).toBe(cell);
    expect(cell).toHaveProperty('value', '1e');
    expect(cell.getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByRole('img', { name: 'Revenue by month' })).toBeNull();
    fireEvent.keyDown(cell, { key: 'Escape' });
    expect(cell).toHaveProperty('value', '5000');
  });

  it('does not prompt for an unchanged document or an invalid numeric draft alone', async () => {
    render(<App />);
    await replace('demo');
    const cell = screen.getByRole('textbox', { name: 'Revenue (NGN), row jan' });
    fireEvent.change(cell, { target: { value: '1200.0' } });
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    fireEvent.change(cell, { target: { value: '-' } });
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    await replace('picker');
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Minimal document' })).toBeTruthy();
  });

  it('preserves dirty state when the picker is cancelled or a file fails to read or validate', async () => {
    await openEditedDemo();
    const note = screen.getByRole('textbox', { name: 'Document note' });
    const picker = screen.getByLabelText('Choose a Mosaic file');
    const click = vi.spyOn(picker, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Open File' }));
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.change(picker, { target: { files: [] } });
    expect(window.confirm).not.toHaveBeenCalled();
    await replace('picker', new File(['{'], 'bad.mosa'));
    expect(screen.getByRole('alert').textContent).toContain('INVALID_JSON');
    const unreadable = file();
    vi.spyOn(unreadable, 'arrayBuffer').mockRejectedValue(new Error('Read failed'));
    await replace('drop', unreadable);
    expect(screen.getByRole('alert').textContent).toContain('could not be read');
    expect(window.confirm).not.toHaveBeenCalled();
    expect(note).toHaveProperty('value', 'Keep my note');
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    await replace('demo');
    expect(window.confirm).toHaveBeenCalledTimes(1);
  });

  it('prompts for edits made while an initially clean document is reading a replacement', async () => {
    render(<App />);
    await replace('demo');
    const delayed = delayedFile();
    await replace('picker', delayed.incoming);
    expect(window.confirm).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Document note' }), {
      target: { value: 'Edited during loading' },
    });
    await delayed.release();
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Document note' })).toHaveProperty(
      'value',
      'Edited during loading',
    );
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
  });

  it('ignores a stale file response after a newer replacement has been cancelled', async () => {
    await openEditedDemo();
    const delayed = delayedFile();
    await replace('picker', delayed.incoming);
    await replace('demo');
    expect(window.confirm).toHaveBeenCalledTimes(1);
    await delayed.release();
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Document note' })).toHaveProperty(
      'value',
      'Keep my note',
    );
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('warns again after cancelling, and clears dirty status only when Download starts successfully', async () => {
    await openEditedDemo();
    await replace('demo');
    await replace('demo');
    expect(window.confirm).toHaveBeenCalledTimes(2);
    vi.mocked(downloadMosaic).mockImplementationOnce(() => {
      throw new Error('Download failed');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(screen.queryByText('Unsaved changes')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Document note' }), {
      target: { value: 'New changes' },
    });
    expect(screen.getByText('Unsaved changes')).toBeTruthy();
    await replace('demo');
    expect(window.confirm).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    await replace('demo');
    expect(window.confirm).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('textbox', { name: 'Document note' })).toHaveProperty(
      'value',
      'First report',
    );
  });
});
