import { describe, expect, it } from 'vitest';
import { processTreeMemory } from '../scripts/benchmarks/process-memory.ts';

describe('browser process memory accounting', () => {
  it('counts only the launched subtree, including out-of-order children, in bytes', () => {
    const result = processTreeMemory(
      ' 40 30 7 /Browser Helper\n10 1 11 /Browser\n20 1 99 /Unrelated\n30 10 13 /Renderer\n',
      10,
    );
    expect(result.rssBytes).toBe((7 + 11 + 13) * 1024);
    expect(result.processes.map((row) => row.pid).sort()).toEqual([10, 30, 40]);
    expect(result.processes[0]!.command).toBe('/Browser Helper');
  });

  it('fails explicitly when the browser exited or ps output cannot be interpreted', () => {
    expect(() => processTreeMemory('1 0 20 init', 42)).toThrow('exited');
    expect(() => processTreeMemory('unsupported output', 42)).toThrow('Unsupported');
  });
});
