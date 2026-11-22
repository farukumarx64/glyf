import { parseGlyf } from '../../src/core/parse.ts';
import type { DatasetRow, GlyfDocument, GlyfNode } from '../../src/core/types.ts';

export const fixtureProfiles = [
  { name: 'small', bytes: 3 * 1024, nodes: 14, rows: 3, columns: 3 },
  { name: 'medium', bytes: 100 * 1024, nodes: 300, rows: 250, columns: 3 },
  { name: 'large', bytes: 1024 * 1024, nodes: 2000, rows: 1000, columns: 20 },
] as const;

export function describeFixture(document: GlyfDocument) {
  const pending: { node: GlyfNode; depth: number }[] = [{ node: document.root, depth: 1 }];
  let nodes = 0;
  let depth = 0;
  let markdownNodes = 0;
  while (pending.length) {
    const current = pending.pop()!;
    nodes++;
    depth = Math.max(depth, current.depth);
    if (current.node.type === 'markdown') markdownNodes++;
    if ('children' in current.node) {
      for (const node of current.node.children) pending.push({ node, depth: current.depth + 1 });
    }
  }
  const dataset = document.datasets!.values!;
  return {
    nodes,
    depth,
    markdownNodes,
    rows: dataset.rows.length,
    columns: dataset.columns.length,
    cells: dataset.rows.length * dataset.columns.length,
    pointsPerChart: dataset.rows.filter((row) => row.amount !== null).length,
    initiallyVisibleRows: Math.min(100, dataset.rows.length),
  };
}

/** Deterministic real content, not padding in ignored metadata or hidden branches. */
export function generateFixture(profile: (typeof fixtureProfiles)[number]) {
  const columns = [
    { key: 'label', label: 'Label', kind: 'string' as const },
    { key: 'amount', label: 'Amount', kind: 'number' as const, editable: true },
    { key: 'active', label: 'Active', kind: 'boolean' as const },
    ...Array.from({ length: profile.columns - 3 }, (_, i) => ({
      key: `value${i}`,
      label: `Value ${i}`,
      kind: 'number' as const,
    })),
  ];
  const rows: DatasetRow[] = Array.from({ length: profile.rows }, (_, i) => ({
    id: `r${i}`,
    label: `Period ${i}`,
    amount: i < 500 ? (i % 100) - 40 : null,
    active: i % 2 === 0,
    ...Object.fromEntries(columns.slice(3).map((column, j) => [column.key, i + j])),
  }));
  const children: GlyfNode[] = [
    { id: 'heading', type: 'heading', level: 2, text: 'Performance fixture' },
    { id: 'intro', type: 'markdown', text: '**Glyf**: portable UTF-8 content — 雪 😀.' },
    ...(['bar', 'line'] as const).map((kind) => ({
      id: kind,
      type: 'chart' as const,
      kind,
      dataset: 'values',
      x: 'label',
      y: 'amount',
      title: `${kind} benchmark`,
    })),
    { id: 'table', type: 'table', dataset: 'values', editable: true },
    { id: 'input', type: 'input', bind: 'note', kind: 'text', label: 'Note' },
    { id: 'toggle', type: 'toggle', bind: 'show', label: 'Show content' },
    { id: 'state', type: 'stateValue', bind: 'note' },
    {
      id: 'condition',
      type: 'when',
      bind: 'show',
      equals: true,
      children: [{ id: 'conditional-text', type: 'text', text: 'Visible conditional content.' }],
    },
    {
      id: 'card',
      type: 'card',
      title: 'Details',
      children: [{ id: 'card-text', type: 'text', text: 'Nested content.' }],
    },
  ];
  const document: GlyfDocument = {
    glyf: '0.1.0',
    id: `benchmark-${profile.name}`,
    meta: { title: `Benchmark ${profile.name}` },
    theme: { mode: 'light', accent: 'blue', density: 'comfortable' },
    datasets: { values: { columns, rows } },
    state: { note: 'Saved note', show: true },
    root: { id: 'root', type: 'column', gap: 1, children },
  };
  for (let count = describeFixture(document).nodes; count < profile.nodes; count++) {
    children.push(
      count % 20 === 0
        ? { id: `n${count}`, type: 'markdown', text: '**Section** with `code` and plain text.' }
        : { id: `n${count}`, type: 'text', text: '' },
    );
  }
  let remaining = profile.bytes - Buffer.byteLength(JSON.stringify(document));
  const textPositions = children.flatMap((node, i) => (node.type === 'text' ? [i] : []));
  const filler = 'Portable Glyf content. ';
  for (const [index, position] of textPositions.entries()) {
    const length = Math.min(10_000, Math.ceil(remaining / (textPositions.length - index)));
    if (length < 0) throw new Error(`Fixture ${profile.name} exceeds its byte budget.`);
    children[position] = {
      id: children[position]!.id,
      type: 'text',
      text: filler.repeat(Math.ceil(length / filler.length)).slice(0, length),
    };
    remaining -= length;
  }
  const source = JSON.stringify(document);
  const result = parseGlyf(source);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  if (remaining !== 0 || Buffer.byteLength(source) !== profile.bytes) {
    throw new Error(`Could not generate exact-size fixture ${profile.name}.`);
  }
  return {
    name: profile.name,
    source,
    bytes: Buffer.byteLength(source),
    ...describeFixture(document),
  };
}

export const baselineSource = JSON.stringify({
  glyf: '0.1.0',
  id: 'benchmark-baseline',
  meta: { title: 'Replacement baseline' },
  root: { id: 'root', type: 'column', children: [] },
} satisfies GlyfDocument);
