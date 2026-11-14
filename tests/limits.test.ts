import { describe, expect, it } from 'vitest';
import schema from '../schema/mosaic-v0.1.schema.json' with { type: 'json' };
import { validateSchema } from '../scripts/schema-validator.ts';
import { jsonPointer, ROOT_POINTER } from '../src/core/json-pointer.ts';
import { checkResourceLimit, MOSAIC_LIMITS, ROOT_NODE_DEPTH } from '../src/core/limits.ts';
import type { MosaicResource } from '../src/core/limits.ts';
import { minimalDocument } from './fixtures.ts';

describe('v0.1 resource budgets', () => {
  it('agrees with every corresponding schema ceiling', () => {
    expect(MOSAIC_LIMITS.datasets).toBe(schema.properties.datasets.maxProperties);
    expect(MOSAIC_LIMITS.columnsPerDataset).toBe(schema.$defs.dataset.properties.columns.maxItems);
    expect(MOSAIC_LIMITS.rowsPerDataset).toBe(schema.$defs.dataset.properties.rows.maxItems);
    expect(MOSAIC_LIMITS.markdownCharacters).toBe(schema.$defs.markdown.properties.text.maxLength);
    expect(MOSAIC_LIMITS.stateKeys).toBe(schema.properties.state.maxProperties);
    for (const name of ['column', 'row', 'grid', 'card', 'when'] as const) {
      // This schema ceiling is per children array, not a replacement for total node counting.
      expect(MOSAIC_LIMITS.nodes).toBe(schema.$defs[name].properties.children.maxItems);
    }
  });

  it('preserves the prose-only budgets and root-depth convention', () => {
    expect(MOSAIC_LIMITS.fileBytes).toBe(5_242_880);
    expect(MOSAIC_LIMITS.nodes).toBe(2_000);
    expect(MOSAIC_LIMITS.treeDepth).toBe(20);
    expect(MOSAIC_LIMITS.totalCells).toBe(20_000);
    expect(MOSAIC_LIMITS.chartPoints).toBe(500);
    expect(ROOT_NODE_DEPTH).toBe(1);
  });

  it('prevents accidental runtime changes to the shared budgets', () => {
    expect(Reflect.set(MOSAIC_LIMITS, 'nodes', 99_999)).toBe(false);
    expect(MOSAIC_LIMITS.nodes).toBe(2_000);
  });

  it.each([
    [20_000, true],
    [20_001, false],
  ])('counts %s astral Unicode characters like JSON Schema, not UTF-16 units', (count, valid) => {
    const value = {
      ...minimalDocument(),
      root: {
        ...minimalDocument().root,
        children: [{ id: 'markdown', type: 'markdown', text: '😀'.repeat(count) }],
      },
    };
    expect(validateSchema(value)).toBe(valid);
  });

  const resources = Object.keys(MOSAIC_LIMITS) as MosaicResource[];
  it.each(resources)('accepts zero, one below, and exactly the %s limit', (resource) => {
    const limit = MOSAIC_LIMITS[resource];
    for (const count of [0, limit - 1, limit]) {
      expect(checkResourceLimit(resource, count, ROOT_POINTER)).toBeUndefined();
    }
  });

  it.each(resources)('reports one over the %s limit with its location', (resource) => {
    const limit = MOSAIC_LIMITS[resource];
    const path = jsonPointer('root');
    const error = checkResourceLimit(resource, limit + 1, path);
    expect(error).toMatchObject({
      code: resource === 'fileBytes' ? 'FILE_TOO_LARGE' : 'RESOURCE_LIMIT',
      path: '/root',
    });
    expect(error?.message).toContain(String(limit));
    expect(error?.message).toContain(String(limit + 1));
  });

  it('uses the document-wide path for an oversized file', () => {
    expect(checkResourceLimit('fileBytes', 5_242_881, ROOT_POINTER)).toEqual({
      code: 'FILE_TOO_LARGE',
      path: '',
      message: 'File size in UTF-8 bytes exceeds the limit of 5242880 (received 5242881).',
    });
  });

  it.each([-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid measured count %s instead of silently allowing it',
    (count) => {
      expect(() => checkResourceLimit('nodes', count, ROOT_POINTER)).toThrow(RangeError);
    },
  );
});
