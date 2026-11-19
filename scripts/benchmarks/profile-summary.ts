import { SourceMap } from 'node:module';

export interface CpuProfile {
  nodes: {
    id: number;
    children?: number[];
    callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  }[];
  samples: number[];
  timeDeltas: number[];
}

/** Attribute sampled time once, preferring Markdown's stack over its React caller. */
export function summarizeCpu(profile: CpuProfile, sourceMap: SourceMap) {
  const frames = new Map(
    profile.nodes.map((node) => {
      const entry = sourceMap.findEntry(node.callFrame.lineNumber, node.callFrame.columnNumber);
      return [
        node.id,
        {
          ...node,
          source:
            node.callFrame.url.includes('/assets/') && 'originalSource' in entry
              ? entry.originalSource
              : node.callFrame.url,
          line: 'originalLine' in entry ? entry.originalLine + 1 : null,
        },
      ];
    }),
  );
  const parents = new Map<number, number>();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parents.set(child, node.id);
  const groups = new Map<string, number>();
  const locations = new Map<string, number>();
  for (const [i, id] of profile.samples.entries()) {
    const leaf = frames.get(id)!;
    let group = leaf.callFrame.functionName.startsWith('(')
      ? leaf.callFrame.functionName
      : 'other JavaScript/native';
    let cursor: number | undefined = id;
    while (cursor !== undefined) {
      const source = frames.get(cursor)!.source;
      if (/node_modules\/(react-markdown|remark-|micromark|mdast-|hast-|unified)/.test(source)) {
        group = 'Markdown processing';
        break;
      }
      cursor = parents.get(cursor);
    }
    const delta = profile.timeDeltas[i]!;
    groups.set(group, (groups.get(group) ?? 0) + delta);
    const location = `${leaf.source}:${leaf.line ?? '?'} ${leaf.callFrame.functionName}`;
    locations.set(location, (locations.get(location) ?? 0) + delta);
  }
  const sorted = (values: Map<string, number>) =>
    [...values]
      .sort((a, b) => b[1] - a[1])
      .map(([name, microseconds]) => ({ name, sampledMs: microseconds / 1000 }));
  return { groups: sorted(groups), topLocations: sorted(locations).slice(0, 30) };
}

export interface HeapSnapshot {
  snapshot: { meta: { node_fields: string[]; node_types: (string[] | string)[] } };
  nodes: number[];
  strings: string[];
}

export function summarizeHeap(heap: HeapSnapshot) {
  const fields = heap.snapshot.meta.node_fields;
  const type = fields.indexOf('type');
  const name = fields.indexOf('name');
  const size = fields.indexOf('self_size');
  const types = heap.snapshot.meta.node_types[type];
  if (
    type < 0 ||
    name < 0 ||
    size < 0 ||
    !Array.isArray(types) ||
    heap.nodes.length % fields.length
  ) {
    throw new Error('Unsupported Chromium heap snapshot layout.');
  }
  const groups = new Map<string, { count: number; selfBytes: number }>();
  for (let offset = 0; offset < heap.nodes.length; offset += fields.length) {
    const key = `${types[heap.nodes[offset + type]!]}: ${heap.strings[heap.nodes[offset + name]!]}`;
    const group = groups.get(key) ?? { count: 0, selfBytes: 0 };
    group.count++;
    group.selfBytes += heap.nodes[offset + size]!;
    groups.set(key, group);
  }
  return groups;
}

export function compareHeaps(
  before: ReturnType<typeof summarizeHeap>,
  after: ReturnType<typeof summarizeHeap>,
) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .map((name) => ({
      name,
      countChange: (after.get(name)?.count ?? 0) - (before.get(name)?.count ?? 0),
      selfBytesChange: (after.get(name)?.selfBytes ?? 0) - (before.get(name)?.selfBytes ?? 0),
    }))
    .filter((item) => item.countChange || item.selfBytesChange)
    .sort((a, b) => b.selfBytesChange - a.selfBytesChange);
}
