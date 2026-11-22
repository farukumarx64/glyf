/**
 * Portable Glyf v0.1 model. This module has no React or runtime dependencies.
 * Patterns, lengths, finite numbers, reserved names, and cross-field constraints
 * require runtime validation; TypeScript alone cannot establish validity.
 */
export type GlyfScalar = string | number | boolean | null;
export type ColumnKind = 'string' | 'number' | 'boolean';
export type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ColumnDefinition {
  /** The schema forbids `id`; semantic validation also rejects reserved names. */
  readonly key: string;
  readonly label: string;
  readonly kind: ColumnKind;
  readonly editable?: boolean;
}

export interface DatasetRow {
  readonly id: string;
  readonly [key: string]: GlyfScalar;
}

export interface Dataset {
  readonly columns: readonly ColumnDefinition[];
  readonly rows: readonly DatasetRow[];
}

export interface GlyfMeta {
  readonly title: string;
  readonly description?: string;
  readonly locale?: string;
}

export interface GlyfTheme {
  readonly mode?: 'system' | 'light' | 'dark';
  readonly accent?: 'blue' | 'teal' | 'amber';
  readonly density?: 'comfortable' | 'compact';
}

interface BaseNode<Type extends string> {
  readonly id: string;
  readonly type: Type;
}

export interface ColumnNode extends BaseNode<'column'> {
  readonly children: readonly GlyfNode[];
  readonly gap?: Gap;
}

export interface RowNode extends BaseNode<'row'> {
  readonly children: readonly GlyfNode[];
  readonly gap?: Gap;
}

export interface GridNode extends BaseNode<'grid'> {
  readonly children: readonly GlyfNode[];
  readonly columns: 1 | 2 | 3 | 4;
  readonly gap?: Gap;
}

export interface CardNode extends BaseNode<'card'> {
  readonly children: readonly GlyfNode[];
  readonly title?: string;
}

export interface WhenNode extends BaseNode<'when'> {
  readonly bind: string;
  readonly equals: GlyfScalar;
  readonly children: readonly GlyfNode[];
}

export interface HeadingNode extends BaseNode<'heading'> {
  readonly level: 1 | 2 | 3 | 4;
  readonly text: string;
}

export interface MarkdownNode extends BaseNode<'markdown'> {
  readonly text: string;
}

export interface TextNode extends BaseNode<'text'> {
  readonly text: string;
}

export type DividerNode = BaseNode<'divider'>;

export interface ChartNode extends BaseNode<'chart'> {
  readonly kind: 'bar' | 'line';
  readonly dataset: string;
  readonly x: string;
  readonly y: string;
  readonly title?: string;
}

export interface TableNode extends BaseNode<'table'> {
  readonly dataset: string;
  readonly editable?: boolean;
}

export interface ToggleNode extends BaseNode<'toggle'> {
  readonly bind: string;
  readonly label: string;
}

export interface InputNode extends BaseNode<'input'> {
  readonly bind: string;
  readonly label: string;
  readonly kind: 'text' | 'number';
}

export interface StateValueNode extends BaseNode<'stateValue'> {
  readonly bind: string;
  readonly prefix?: string;
  readonly suffix?: string;
}

export type LayoutNode = ColumnNode | RowNode | GridNode | CardNode;

export type GlyfNode =
  | LayoutNode
  | WhenNode
  | HeadingNode
  | MarkdownNode
  | TextNode
  | DividerNode
  | ChartNode
  | TableNode
  | ToggleNode
  | InputNode
  | StateValueNode;

export interface GlyfDocument {
  readonly glyf: '0.1.0';
  readonly id: string;
  readonly meta: GlyfMeta;
  readonly theme?: GlyfTheme;
  readonly datasets?: Readonly<Record<string, Dataset>>;
  readonly state?: Readonly<Record<string, GlyfScalar>>;
  /** The specification restricts a validated document's root to a layout node. */
  readonly root: LayoutNode;
}
