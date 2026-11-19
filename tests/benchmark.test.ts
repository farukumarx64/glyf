import { describe, expect, it } from 'vitest';
import { fixtureProfiles, generateFixture } from '../scripts/benchmarks/fixtures.ts';
import { memorySlope, summarize } from '../scripts/benchmarks/statistics.ts';
import { parseMosaic } from '../src/core/parse.ts';
import { serializeMosaic } from '../src/core/serialize.ts';

describe('benchmark evidence', () => {
  it.each(fixtureProfiles)(
    'generates deterministic, valid $name fixtures at the promised limits',
    (profile) => {
      const fixture = generateFixture(profile);
      expect(generateFixture(profile)).toEqual(fixture);
      expect(Buffer.byteLength(fixture.source)).toBe(profile.bytes);
      expect(fixture.nodes).toBe(profile.nodes);
      expect(fixture.rows).toBe(profile.rows);
      expect(fixture.cells).toBe(profile.rows * profile.columns);
      expect(fixture.pointsPerChart).toBe(Math.min(profile.rows, 500));
      const result = parseMosaic(fixture.source);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(parseMosaic(serializeMosaic(result.document))).toEqual(result);
    },
  );

  it('uses median and nearest-rank p95 without mutating or discarding samples', () => {
    const values = Object.freeze(Array.from({ length: 20 }, (_, i) => 20 - i));
    expect(summarize(values)).toEqual({
      samples: values,
      count: 20,
      median: 10.5,
      p95: 19,
      min: 1,
      max: 20,
    });
    expect(summarize([1, 9, 3]).median).toBe(3);
    expect(summarize([0]).p95).toBe(0);
  });

  it('rejects missing and invalid timing evidence', () => {
    for (const values of [[], [NaN], [Infinity], [-1]]) expect(() => summarize(values)).toThrow();
  });

  it('reports flat and growing retained heap slopes in bytes per cycle', () => {
    expect(
      memorySlope([
        { cycle: 0, usedSize: 100 },
        { cycle: 10, usedSize: 100 },
        { cycle: 20, usedSize: 100 },
      ]),
    ).toBe(0);
    expect(
      memorySlope([
        { cycle: 0, usedSize: 100 },
        { cycle: 10, usedSize: 200 },
        { cycle: 20, usedSize: 300 },
      ]),
    ).toBe(10);
    expect(() => memorySlope([])).toThrow();
    expect(() =>
      memorySlope([
        { cycle: 0, usedSize: 1 },
        { cycle: 0, usedSize: 2 },
      ]),
    ).toThrow();
  });
});
