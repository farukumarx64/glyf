import { SourceMap } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  compareHeaps,
  summarizeCpu,
  summarizeHeap,
} from '../scripts/benchmarks/profile-summary.ts';

describe('profiling evidence summaries', () => {
  it('attributes a native child sample to its mapped Markdown stack exactly once', () => {
    const sourceMap = new SourceMap({
      version: 3,
      file: 'app.js',
      sources: ['node_modules/react-markdown/lib/index.js', 'src/Chart.tsx'],
      names: [],
      sourceRoot: '',
      sourcesContent: ['', ''],
      mappings: 'AAAA;ACAA',
    });
    const frame = (functionName: string, lineNumber: number, url = '/assets/app.js') => ({
      functionName,
      url,
      lineNumber,
      columnNumber: 0,
    });
    const result = summarizeCpu(
      {
        nodes: [
          { id: 1, children: [2], callFrame: frame('Markdown', 0) },
          { id: 2, callFrame: frame('native', -1, '') },
          { id: 3, callFrame: frame('Chart', 1) },
          { id: 4, callFrame: frame('(idle)', -1, '') },
        ],
        samples: [2, 3, 4],
        timeDeltas: [1000, 2000, 5000],
      },
      sourceMap,
    );
    expect(result.groups).toEqual([
      { name: '(idle)', sampledMs: 5 },
      { name: 'other JavaScript/native', sampledMs: 2 },
      { name: 'Markdown processing', sampledMs: 1 },
    ]);
  });

  it('distinguishes retained code growth from object release using snapshot field metadata', () => {
    const metadata = {
      snapshot: {
        meta: {
          node_fields: ['name', 'self_size', 'type'],
          node_types: ['string', 'number', ['object', 'code']],
        },
      },
      strings: ['Document', 'InstructionStream'],
    };
    const before = summarizeHeap({ ...metadata, nodes: [0, 16, 0, 0, 24, 0, 1, 32, 1] });
    const after = summarizeHeap({ ...metadata, nodes: [0, 16, 0, 1, 64, 1] });
    expect(compareHeaps(before, after)).toEqual([
      { name: 'code: InstructionStream', countChange: 0, selfBytesChange: 32 },
      { name: 'object: Document', countChange: -1, selfBytesChange: -24 },
    ]);
    expect(() => summarizeHeap({ ...metadata, nodes: [0] })).toThrow('snapshot layout');
  });
});
