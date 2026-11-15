import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseMosaicText } from '../src/core/parse.ts';
import { MOSAIC_LIMITS } from '../src/core/limits.ts';
import { preflightMosaic } from '../src/core/preflight.ts';
import { validateMosaic } from '../src/core/validate.ts';
import { validateSchema } from '../scripts/schema-validator.ts';
import { minimalDocument } from './fixtures.ts';

const divider = (i: number) => ({ type: 'divider', id: 'item' + i });
function chain(depth: number) {
  let root: object = divider(1);
  for (let i = 1; i < depth; i++) root = { type: 'card', id: 'card' + i, children: [root] };
  return root;
}
const documentWith = (root: unknown) => ({ ...minimalDocument(), root });

describe('preflight before structural validation', () => {
  it('accepts the reference file through the source and direct validation APIs', () => {
    const source = parseMosaicText(
      readFileSync(new URL('../examples/mosaic-demo.mosa', import.meta.url), 'utf8'),
    );
    expect(source.ok && validateMosaic(source.value)).toMatchObject({ ok: true });
  });

  it.each([1999, 2000, 2001])('counts the root in a %i-node document', (size) => {
    const children = Array.from({ length: size - 1 }, (_, i) => divider(i));
    const value = documentWith({ ...minimalDocument().root, children });
    const result = validateMosaic(value);
    if (size <= 2000) expect(result).toMatchObject({ ok: true });
    else
      expect(result).toMatchObject({
        ok: false,
        errors: [
          {
            code: 'RESOURCE_LIMIT',
            path: '/root/children',
            message: expect.stringContaining('2001'),
          },
        ],
      });
  });

  it.each([19, 20, 21])('uses node levels for a chain of depth %i', (depth) => {
    const result = validateMosaic(documentWith(chain(depth)));
    if (depth <= 20) expect(result).toMatchObject({ ok: true });
    else
      expect(result).toMatchObject({
        ok: false,
        errors: [
          {
            code: 'RESOURCE_LIMIT',
            path: '/root' + '/children/0'.repeat(20),
            message: expect.stringContaining('21'),
          },
        ],
      });
  });

  it('includes a hidden conditional branch in the aggregate across child lists', () => {
    const value = {
      ...minimalDocument(),
      state: { visible: false },
      root: {
        ...minimalDocument().root,
        children: [
          {
            type: 'row',
            id: 'visible',
            children: Array.from({ length: 999 }, (_, i) => divider(i)),
          },
          {
            type: 'when',
            id: 'hidden',
            bind: 'visible',
            equals: true,
            children: Array.from({ length: 999 }, (_, i) => divider(i + 999)),
          },
        ],
      },
    };
    expect(validateMosaic(value)).toMatchObject({
      ok: false,
      errors: [{ code: 'RESOURCE_LIMIT', path: '/root/children/1/children' }],
    });
  });

  it('stops before schema validation even when required fields are missing', () => {
    // An empty object in a node slot is malformed. Resource preflight runs first.
    const value = { root: { children: new Array(100_000) } };
    expect(validateMosaic(value)).toMatchObject({
      ok: false,
      errors: [{ code: 'RESOURCE_LIMIT', path: '/root/children' }],
    });
    expect(validateSchema(value)).toBe(false);
    expect(validateSchema.errors?.[0]?.keyword).toBe('preflight');
  });

  it('checks depth at every occurrence of a shared subtree', () => {
    const shared = chain(2);
    let deep: object = shared;
    for (let i = 0; i < 18; i++) deep = { type: 'card', id: 'wrap' + i, children: [deep] };
    const root = { ...minimalDocument().root, children: [shared, deep] };
    expect(validateMosaic(documentWith(root))).toMatchObject({
      ok: false,
      errors: [{ code: 'RESOURCE_LIMIT', path: '/root/children/1' + '/children/0'.repeat(19) }],
    });
  });

  it('counts shared node occurrences toward the document budget', () => {
    const shared = {
      type: 'row',
      id: 'branch',
      children: Array.from({ length: 1000 }, (_, i) => divider(i)),
    };
    expect(
      preflightMosaic(documentWith({ ...minimalDocument().root, children: [shared, shared] })),
    ).toMatchObject({ code: 'RESOURCE_LIMIT', path: '/root/children/1/children' });
  });

  it('rechecks a shared object as a node after visiting it through an ordinary data field', () => {
    const shared = chain(20);
    const value = {
      extra: shared,
      ...documentWith({ ...minimalDocument().root, children: [shared] }),
    };
    expect(validateMosaic(value)).toMatchObject({
      ok: false,
      errors: [{ code: 'RESOURCE_LIMIT', path: '/root' + '/children/0'.repeat(20) }],
    });
  });

  it('uses the same version diagnostics for direct input and source text', () => {
    for (const value of [{ mosaic: '0.2.0' }, { mosaic: 1 }, {}]) {
      expect(validateMosaic(value)).toEqual(parseMosaicText(JSON.stringify(value)));
    }
  });

  it('preserves distinct diagnostics for structural constraints and published schema limits', () => {
    const text = 'x'.repeat(MOSAIC_LIMITS.markdownCharacters + 1);
    expect(
      validateMosaic(
        documentWith({
          ...minimalDocument().root,
          children: [{ id: 'm', type: 'markdown', text }],
        }),
      ),
    ).toMatchObject({
      ok: false,
      errors: [{ code: 'RESOURCE_LIMIT', path: '/root/children/0/text' }],
    });
    expect(
      validateMosaic({ ...minimalDocument(), meta: { title: 'x'.repeat(201) } }),
    ).toMatchObject({ ok: false, errors: [{ code: 'SCHEMA_ERROR', path: '/meta/title' }] });
  });

  it('leaves malformed child shapes within budget to the schema stage', () => {
    for (const value of [
      null,
      [],
      { root: null },
      documentWith({ ...minimalDocument().root, children: 'invalid' }),
    ]) {
      expect(preflightMosaic(value)).toBeUndefined();
      expect(validateMosaic(value)).toMatchObject({
        ok: false,
        errors: [{ code: 'SCHEMA_ERROR' }],
      });
    }
  });

  it('only counts root/children node positions, even if data properties are named root or children', () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      id: 'r' + i,
      root: 'text',
      children: null,
    }));
    const data = {
      columns: [
        { key: 'root', kind: 'string', label: 'Root' },
        { key: 'children', kind: 'string', label: 'Children' },
      ],
      rows,
    };
    const value = {
      ...minimalDocument(),
      datasets: { a: data, b: structuredClone(data), c: structuredClone(data) },
    };
    expect(validateMosaic(value)).toMatchObject({ ok: true });
  });

  it('reports the depth limit for a deeply nested direct node chain', () => {
    expect(validateMosaic(documentWith(chain(30000)))).toMatchObject({
      ok: false,
      errors: [
        { code: 'RESOURCE_LIMIT', path: '/root' + '/children/0'.repeat(MOSAIC_LIMITS.treeDepth) },
      ],
    });
  });
});

describe('direct JavaScript object graphs', () => {
  it('reports a back edge from a node to itself', () => {
    const root = { ...minimalDocument().root, children: [] as unknown[] };
    root.children.push(root);
    expect(validateMosaic(documentWith(root))).toMatchObject({
      ok: false,
      errors: [
        {
          code: 'SCHEMA_ERROR',
          path: '/root/children/0',
          message: expect.stringContaining('Circular'),
        },
      ],
    });
  });

  it('rejects a cycle from a nested array to the document, including escaped property names', () => {
    const value = { ...minimalDocument(), state: { 'a/b~': [] as unknown[] } };
    value.state['a/b~'].push(value);
    expect(validateMosaic(value)).toMatchObject({
      ok: false,
      errors: [
        {
          code: 'SCHEMA_ERROR',
          path: '/state/a~1b~0/0',
          message: expect.stringContaining('Circular'),
        },
      ],
    });
  });

  it('checks cycles in dataset rows and unknown properties before schema errors', () => {
    const row: Record<string, unknown> = { id: 'r' };
    row.link = [row];
    for (const [key, value] of Object.entries({
      datasets: { table: { rows: [row] } },
      extra: row,
    })) {
      const path = key === 'datasets' ? '/datasets/table/rows/0/link/0' : '/extra/link/0';
      expect(validateMosaic({ ...minimalDocument(), [key]: value })).toMatchObject({
        ok: false,
        errors: [{ code: 'SCHEMA_ERROR', path, message: expect.stringContaining('Circular') }],
      });
    }
  });

  it('accepts shared acyclic data without mutating it or caching results across calls', () => {
    const list: unknown[] = [];
    const first = Object.freeze({
      columns: Object.freeze([{ key: 'x', kind: 'number', label: 'X' }]),
      rows: list,
    });
    const doc = Object.freeze({ ...minimalDocument(), datasets: { a: first, b: first } });
    expect(validateMosaic(doc)).toMatchObject({ ok: true });
    list.push(first);
    expect(validateMosaic(doc)).toMatchObject({
      ok: false,
      errors: [{ code: 'SCHEMA_ERROR', path: '/datasets/a/rows/0' }],
    });
    list.pop();
    expect(validateMosaic(doc)).toMatchObject({ ok: true });
  });

  it('handles deep cyclic data outside the tree iteratively', () => {
    const head: Record<string, unknown> = {};
    let tail = head;
    for (let i = 0; i < 12000; i++) {
      const next = {};
      tail.next = next;
      tail = next;
    }
    tail.loop = head;
    const result = validateMosaic({ ...minimalDocument(), state: { deep: head } });
    expect(result).toMatchObject({
      ok: false,
      errors: [{ code: 'SCHEMA_ERROR', path: '/state/deep' + '/next'.repeat(12000) + '/loop' }],
    });
  });

  it('rejects an accessor without invoking it, and accepts own properties of null-prototype records', () => {
    const value = Object.assign(Object.create(null) as Record<string, unknown>, minimalDocument());
    expect(validateMosaic(value)).toMatchObject({ ok: true });
    const getter = vi.fn(() => value);
    Object.defineProperty(value, 'extra', { get: getter, enumerable: true });
    expect(validateMosaic(value)).toMatchObject({
      ok: false,
      errors: [{ code: 'SCHEMA_ERROR', path: '/extra' }],
    });
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects symbol and hidden fields on direct input at the nearest JSON location', () => {
    const value = minimalDocument();
    Object.defineProperty(value.meta, 'internal', { value });
    expect(validateMosaic(value)).toMatchObject({
      ok: false,
      errors: [{ code: 'SCHEMA_ERROR', path: '/meta/internal' }],
    });
    expect(
      validateMosaic({ ...minimalDocument(), meta: { title: 'T', [Symbol('extra')]: 1 } }),
    ).toMatchObject({ ok: false, errors: [{ code: 'SCHEMA_ERROR', path: '/meta' }] });
  });

  it('rejects sparse and decorated arrays as non-JSON containers', () => {
    const extra = Object.assign([], { extra: 1 });
    for (const children of [new Array(2), extra]) {
      expect(validateMosaic(documentWith({ ...minimalDocument().root, children }))).toMatchObject({
        ok: false,
        errors: [{ code: 'SCHEMA_ERROR', path: '/root/children' }],
      });
    }
  });
});
