import { describe, expect, it, vi } from 'vitest';
import { serializeGlyf } from '../src/core/serialize.ts';
import { createDocumentStore } from '../src/core/store.ts';
import { validateGlyf } from '../src/core/validate.ts';
import { typedDocument } from './fixtures.ts';

function open() {
  const validated = validateGlyf(typedDocument);
  if (!validated.ok) throw new Error(JSON.stringify(validated.errors));
  return createDocumentStore(validated);
}

describe('document dirty tracking', () => {
  it.each(['state', 'cell'] as const)(
    'marks a changed %s edit dirty before notifying readers',
    (kind) => {
      const store = open();
      expect(store.isDirty()).toBe(false);
      const listener = vi.fn(() => store.isDirty());
      store.subscribe(listener);
      const result =
        kind === 'state'
          ? store.updateState('note', 'Changed')
          : store.updateCell('table', 'first', 'amount', 15);
      expect(result.ok).toBe(true);
      expect(store.isDirty()).toBe(true);
      expect(listener).toHaveReturnedWith(true);
      expect(listener).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps identical and rejected edits clean without notifying subscribers', () => {
    const store = open();
    const original = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.updateState('note', 'Hello').ok).toBe(true);
    expect(store.updateCell('table', 'first', 'amount', -2.5).ok).toBe(true);
    expect(store.updateState('note', 12).ok).toBe(false);
    expect(store.updateState('missing', true).ok).toBe(false);
    expect(store.updateCell('table', 'first', 'amount', Infinity).ok).toBe(false);
    expect(store.updateCell('table', 'first', 'label', 'Read-only').ok).toBe(false);
    expect(store.getSnapshot()).toBe(original);
    expect(store.isDirty()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('clears the current checkpoint without changing the document or serializing viewer metadata', () => {
    const store = open();
    store.updateState('note', 'Changed');
    const snapshot = store.getSnapshot();
    const text = serializeGlyf(snapshot);
    const listener = vi.fn(() => store.isDirty());
    store.subscribe(listener);
    store.markDownloaded(snapshot);
    expect(store.isDirty()).toBe(false);
    expect(store.getSnapshot()).toBe(snapshot);
    expect(serializeGlyf(store.getSnapshot())).toBe(text);
    expect(listener).toHaveReturnedWith(false);
    expect(listener).toHaveBeenCalledTimes(1);
    store.markDownloaded(snapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(text)).toEqual(snapshot);
    expect(snapshot).not.toHaveProperty('dirty');
    expect(typedDocument.state.note).toBe('Hello');
    store.updateCell('table', 'first', 'amount', 8);
    expect(store.isDirty()).toBe(true);
  });

  it('does not mark newer edits clean when given an older or foreign snapshot', () => {
    const store = open();
    store.updateState('note', 'First');
    const earlier = store.getSnapshot();
    store.updateState('note', 'Second');
    const listener = vi.fn();
    store.subscribe(listener);
    store.markDownloaded(earlier);
    store.markDownloaded(structuredClone(store.getSnapshot()));
    expect(store.isDirty()).toBe(true);
    expect(listener).not.toHaveBeenCalled();
    store.markDownloaded(store.getSnapshot());
    expect(store.isDirty()).toBe(false);
  });

  it('keeps the dirty flag after manually reverting edits until the next download', () => {
    const store = open();
    store.updateState('visible', false);
    store.updateState('visible', true);
    expect(store.getSnapshot()).toEqual(typedDocument);
    expect(store.isDirty()).toBe(true);
    store.markDownloaded(store.getSnapshot());
    expect(store.isDirty()).toBe(false);
    expect(open().isDirty()).toBe(false);
  });
});
