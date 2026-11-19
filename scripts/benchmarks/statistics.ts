export function summarize(samples: readonly number[]) {
  if (!samples.length || samples.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error('Measurements must be non-empty, finite, and non-negative.');
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    samples: [...samples],
    count: sorted.length,
    median: sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
    min: sorted[0]!,
    max: sorted.at(-1)!,
  };
}

/** Least-squares bytes/cycle; descriptive evidence, not an automatic leak verdict. */
export function memorySlope(samples: readonly { cycle: number; usedSize: number }[]) {
  if (samples.length < 2) throw new Error('At least two memory checkpoints are required.');
  const meanX = samples.reduce((sum, item) => sum + item.cycle, 0) / samples.length;
  const meanY = samples.reduce((sum, item) => sum + item.usedSize, 0) / samples.length;
  const denominator = samples.reduce((sum, item) => sum + (item.cycle - meanX) ** 2, 0);
  if (!denominator) throw new Error('Memory checkpoints must span multiple cycles.');
  return (
    samples.reduce((sum, item) => sum + (item.cycle - meanX) * (item.usedSize - meanY), 0) /
    denominator
  );
}
