// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentView } from '../src/app/DocumentView.tsx';
import { createDocumentStore } from '../src/core/store.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { minimalDocument, nodeSamples } from './fixtures.ts';

afterEach(cleanup);

function open(kind: 'toggle' | 'input') {
  const doc = minimalDocument();
  const isToggle = kind === 'toggle';
  const result = validateMosaic({
    ...doc,
    state: { visible: true, count: 0, note: 'Outside' },
    root: {
      ...doc.root,
      children: [
        {
          ...nodeSamples.when,
          bind: isToggle ? 'visible' : 'count',
          equals: isToggle ? true : 0,
          children: [
            isToggle
              ? nodeSamples.toggle
              : { ...nodeSamples.input, kind: 'number', bind: 'count', label: 'Count' },
          ],
        },
        { ...nodeSamples.input, id: 'outside', label: 'Outside note' },
      ],
    },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  const store = createDocumentStore(result);
  render(<DocumentView store={store} fileName="focus.mosa" />);
  return store;
}

describe('focus during conditional updates', () => {
  it.each(['toggle', 'input'] as const)(
    'returns focus to Preview when a %s hides itself',
    (kind) => {
      const store = open(kind);
      const control =
        kind === 'toggle'
          ? screen.getByRole('checkbox', { name: 'Visible' })
          : screen.getByRole('textbox', { name: 'Count' });
      control.focus();
      if (kind === 'toggle') fireEvent.click(control);
      else fireEvent.change(control, { target: { value: '1' } });
      expect(control.isConnected).toBe(false);
      expect(document.activeElement).toBe(screen.getByRole('tabpanel', { name: 'Preview' }));
      expect(store.getSnapshot().state?.[kind === 'toggle' ? 'visible' : 'count']).toBe(
        kind === 'toggle' ? false : 1,
      );
    },
  );

  it('preserves focus on a surviving control and on Source during other state changes', () => {
    const store = open('toggle');
    const outside = screen.getByRole('textbox', { name: 'Outside note' });
    outside.focus();
    act(() => {
      store.updateState('visible', false);
    });
    expect(document.activeElement).toBe(outside);
    fireEvent.change(outside, { target: { value: 'Still focused' } });
    expect(document.activeElement).toBe(outside);
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Preview' }), { key: 'ArrowRight' });
    const source = screen.getByRole('tab', { name: 'Source' });
    expect(document.activeElement).toBe(source);
    act(() => {
      store.updateState('visible', true);
    });
    expect(document.activeElement).toBe(source);
  });

  it('forgets a removed control when focus has already moved outside the document', () => {
    const store = open('toggle');
    render(<button>Outside document</button>);
    screen.getByRole('checkbox', { name: 'Visible' }).focus();
    const outside = screen.getByRole('button', { name: 'Outside document' });
    outside.focus();
    act(() => {
      store.updateState('visible', false);
    });
    expect(document.activeElement).toBe(outside);
    outside.blur();
    act(() => {
      store.updateState('note', 'An unrelated update');
    });
    expect(document.activeElement).toBe(document.body);
  });
});
