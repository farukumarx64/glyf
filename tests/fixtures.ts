import type { GlyfDocument, GlyfNode } from '../src/core/types.ts';

// The mapped type requires a fixture for every discriminant and checks each
// fixture against its own node type. Schema tests validate the same fixtures.
export const nodeSamples = {
  column: { id: 'column', type: 'column', children: [], gap: 0 },
  row: { id: 'row', type: 'row', children: [], gap: 6 },
  grid: { id: 'grid', type: 'grid', children: [], columns: 4, gap: 3 },
  card: { id: 'card', type: 'card', children: [], title: 'Card' },
  when: { id: 'when', type: 'when', bind: 'visible', equals: true, children: [] },
  heading: { id: 'heading', type: 'heading', level: 1, text: 'Heading' },
  markdown: { id: 'markdown', type: 'markdown', text: '**Markdown**' },
  text: { id: 'text', type: 'text', text: 'Plain text' },
  divider: { id: 'divider', type: 'divider' },
  chart: {
    id: 'chart',
    type: 'chart',
    kind: 'bar',
    dataset: 'values',
    x: 'label',
    y: 'amount',
    title: 'Values',
  },
  table: { id: 'table', type: 'table', dataset: 'values', editable: true },
  toggle: { id: 'toggle', type: 'toggle', bind: 'visible', label: 'Visible' },
  input: { id: 'input', type: 'input', bind: 'note', label: 'Note', kind: 'text' },
  stateValue: { id: 'stateValue', type: 'stateValue', bind: 'note', prefix: '(', suffix: ')' },
} satisfies { [Type in GlyfNode['type']]: Extract<GlyfNode, { type: Type }> };

export const typedDocument = {
  glyf: '0.1.0',
  id: 'all_nodes',
  meta: { title: 'Format coverage', description: 'All node types', locale: 'en' },
  theme: { mode: 'system', accent: 'blue', density: 'comfortable' },
  datasets: {
    values: {
      columns: [
        { key: 'label', label: 'Label', kind: 'string', editable: false },
        { key: 'amount', label: 'Amount', kind: 'number', editable: true },
        { key: 'active', label: 'Active', kind: 'boolean' },
      ],
      rows: [
        { id: 'first', label: 'First', amount: -2.5, active: true },
        { id: 'second', label: 'Second', amount: null, active: false },
      ],
    },
  },
  state: { visible: true, note: 'Hello', count: 3, empty: null },
  root: { id: 'root', type: 'column', children: Object.values(nodeSamples) },
} satisfies GlyfDocument;

export function minimalDocument() {
  return {
    glyf: '0.1.0',
    id: 'minimal',
    meta: { title: 'Minimal document' },
    root: { id: 'root', type: 'column', children: [] },
  } satisfies GlyfDocument;
}
