# Mosaic v0.1 — Technical Specification & Development Plan

> **Status:** Proposed engineering specification · **Working name:** Mosaic · **File extension:** `.mosa` · **Format version:** `0.1.0`  
> **Intended audience:** Codex / an implementing developer  
> **Priority order:** Correctness and safety → small, portable files → fast loading/rendering → low memory usage → visual quality → extensibility.

> **Repository edition (2026-11-15):** Incorporates the eight owner-approved decisions in [decisions.md](decisions.md). The unmodified supplied plan and schema are retained in `docs/reference/`. Phase 0 and the Phase 1 core (safe parsing, resource preflight, full validation, and serialization) are implemented. Embedded example prompts below are reference material, not authorization to begin work.

## 0. Instructions to Codex

Build **Mosaic v0.1**, a local-first browser viewer/editor for declarative `.mosa` documents. Treat this document as the implementation contract. The companion files are:

- `mosaic-v0.1.schema.json` — the machine-readable JSON Schema (Draft 2020-12).
- `mosaic-demo.mosa` — a conforming example document and initial golden fixture.

**Work incrementally and in order.** Begin by inspecting the repository, then create the project if it is empty. Implement one milestone at a time, run its tests, fix failures, and report what is done and what remains. Favor small, straightforward abstractions; avoid premature monorepo setup, cloud infrastructure, heavy editors, charting frameworks, and autonomous package upgrades. Do not replace the schema or silently expand v0.1 scope. If the two companion files are unavailable, create them from the specification below, record that substitution, and validate them before proceeding.

Do not claim successful tests, performance, or builds without running them. Do not push to a remote or publish a package without explicit authorization. Track significant design decisions in `docs/decisions.md`.

---

## 1. Product thesis

Mosaic is an **AI-native, portable visual document format**. A document declares _what_ should be presented (text, layout, datasets, charts, controls) while a trusted viewer implements _how_ it looks and behaves.

A `.mosa` file is **not** a webpage, executable application, Markdown derivative, compressed archive, or framework-specific React tree. It is a compact **UTF-8 JSON document** with a versioned component vocabulary. Markdown is embedded as plain strings inside `markdown` nodes.

### v0.1 promise

A user can:

1. Open a local `.mosa` file in a browser app, with no account or backend.
2. View headings, Markdown, cards, layouts, a chart, and a data table.
3. Interact with a toggle or text/number input, including conditional content.
4. Edit permitted table cells; charts using the same dataset update accordingly.
5. See helpful errors for malformed or unsupported documents.
6. Download the modified document as a valid `.mosa` file, reopen it, and retain edits.
7. Inspect the underlying JSON in a lightweight source view.

### Non-goals for v0.1

No freehand Excalidraw-style infinite canvas, 3D engine, arbitrary HTML/CSS/JS, user-provided scripts, plugin execution, remote data fetching, images/assets, formulas, multi-user collaboration, cloud storage, authentication, live AI API integration, document-to-PDF export, DOCX import/export, full spreadsheet formulas, or OS-level double-click association. These are **later versions**. v0.1 is the trustworthy foundation.

### Principles

- **One format, many renderers:** React is an implementation detail of the first viewer, not part of the format.
- **Readable over clever:** JSON is debuggable, diffable, and directly generatable by AI.
- **Declarative over executable:** approved component types and data bindings only.
- **Local and private by default:** opening a document must not send it over a network.
- **Deterministic:** the same valid document and input state produce the same component tree and data values.
- **Measure before optimizing:** do not trade simplicity for presumed savings.

---

## 2. Architecture

```text
.mosa file (UTF-8 JSON)
        |
        v
[byte-size guard] -> [strict UTF-8 decode] -> [duplicate-key scan]
                                          |
                                          v
                                     [JSON.parse]
                                          |
                                          v
                              [iterative resource preflight]
                                          |
                                          v
                                 [JSON Schema validator]
                                          |
                                          v
                                  [semantic validator]
                                          |
                                          v
                                     [document model]
                                          |
                        +-----------------+------------------+
                        |                 |                  |
                    [renderer]      [local state]      [data store]
                        |                 |                  |
                 React components <-------+------------------+
                        |
                        v
                Accessible DOM + SVG
                        |
              [import / edits / export]
                        |
                        v
                     .mosa file
```

The app itself is a static Vite build. It does **not** need a server, an AI provider, or internet access to process local documents. During development it is served from `localhost`; production may be served as static files or offered as an installable offline app in a later step. **Do not promise that double-clicking `index.html` using `file://` will work** across all browsers.

### Layers

| Layer          | Responsibility                                                 | Must not do                         |
| -------------- | -------------------------------------------------------------- | ----------------------------------- |
| Format         | Specify JSON structure, node vocabulary, versioning, semantics | Depend on React                     |
| Parser         | Check byte limit; parse JSON; return typed error/result        | Render components                   |
| Validator      | JSON Schema + global/semantic invariants                       | Evaluate document-authored code     |
| Document store | Store datasets/state; apply permitted edits                    | Mutate input objects unpredictably  |
| Renderer       | Convert valid nodes to accessible React DOM/SVG                | Interpret arbitrary HTML/JS         |
| Shell          | File open, preview, source inspection, save/download           | Upload documents without permission |

Use explicit errors and discriminated TypeScript unions. Keep libraries behind small interfaces so the format remains portable.

---

## 3. Normative `.mosa` file specification

### 3.1 Encoding and file handling

- File extension: `.mosa` (working, **not registered** as a standard format).
- Content: **one JSON object**, UTF-8, optional BOM may be stripped on import.
- File should end with `\n` when serialized by Mosaic; tolerate files without it.
- Parsed top-level document **MUST** follow `mosaic-v0.1.schema.json` and semantic rules below.
- The top-level `mosaic` field must equal the exact string `"0.1.0"`.
- Unknown core fields and unknown component types must be rejected in v0.1; never silently execute or reinterpret them.
- Content may be pretty-printed or minified; whitespace has no semantic meaning outside string values.
- For downloads, use the provisional media type `application/json`; **do not claim an officially registered `.mosa` MIME type**.

### 3.2 Top-level fields

| Field      | Type         | Required | Meaning                                            |
| ---------- | ------------ | -------- | -------------------------------------------------- |
| `mosaic`   | string       | yes      | Exact format version `0.1.0`                       |
| `id`       | string       | yes      | Stable document identifier                         |
| `meta`     | object       | yes      | `title`, optional `description`, `locale`          |
| `theme`    | object       | no       | Viewer theme tokens                                |
| `datasets` | keyed object | no       | Tabular source data                                |
| `state`    | keyed object | no       | Persistent values used by controls                 |
| `root`     | node         | yes      | Root component; semantically must be a layout node |

Allowed theme fields: `mode: "light" | "dark" | "system"`, `accent: "blue" | "teal" | "amber"`, `density: "comfortable" | "compact"`. Default to `system`, `blue`, `comfortable`; apply themes through trusted CSS tokens, not free-form CSS supplied by documents.

Node IDs: regex `^[A-Za-z][A-Za-z0-9_-]{0,63}$`. IDs **MUST be unique across the whole node tree**. Dataset names, state keys, column keys, and bindings: regex `^[A-Za-z][A-Za-z0-9_]{0,63}$`. Reject duplicate IDs/keys. No references to `__proto__`, `prototype`, or `constructor`, even if a future validator loosens key rules.

Reject duplicate property names within every JSON object before `JSON.parse`, comparing decoded names so escaped equivalents also count as duplicates. Reusing a property name in different objects is valid. Use a tested token scanner, not a regular expression. Explicitly reject `__proto__`, `prototype`, and `constructor` in dataset/state/column declarations and their references; the key regex alone is insufficient. Ordinary text may contain these words. Use `Map` or own-property checks for lookups and avoid generic merging of untrusted objects. See decisions D001 and D007.

### 3.3 Example document

The full example is `mosaic-demo.mosa`. This shortened example demonstrates the shape:

```json
{
  "mosaic": "0.1.0",
  "id": "hello_mosaic",
  "meta": { "title": "Hello Mosaic" },
  "datasets": {
    "numbers": {
      "columns": [
        { "key": "label", "label": "Item", "kind": "string" },
        { "key": "value", "label": "Value", "kind": "number", "editable": true }
      ],
      "rows": [
        { "id": "a", "label": "A", "value": 10 },
        { "id": "b", "label": "B", "value": 25 }
      ]
    }
  },
  "state": { "showChart": true },
  "root": {
    "id": "root",
    "type": "column",
    "children": [
      { "id": "heading1", "type": "heading", "level": 1, "text": "Hello Mosaic" },
      { "id": "body1", "type": "markdown", "text": "This is **portable**." },
      { "id": "toggle1", "type": "toggle", "label": "Show chart", "bind": "showChart" },
      {
        "id": "section1",
        "type": "when",
        "bind": "showChart",
        "equals": true,
        "children": [
          {
            "id": "chart1",
            "type": "chart",
            "kind": "bar",
            "dataset": "numbers",
            "x": "label",
            "y": "value"
          }
        ]
      },
      { "id": "table1", "type": "table", "dataset": "numbers", "editable": true }
    ]
  }
}
```

### 3.4 Component vocabulary (exact names)

All nodes have an `id` and `type`. Only fields below are supported; the schema defines the full field-level constraints.

| Type         | Required fields beyond `id`, `type`        | Optional fields            | Behavior                                                     |
| ------------ | ------------------------------------------ | -------------------------- | ------------------------------------------------------------ |
| `column`     | `children`                                 | `gap` (0–6)                | Vertical stack                                               |
| `row`        | `children`                                 | `gap` (0–6)                | Horizontal, wraps responsively                               |
| `grid`       | `children`, `columns` (1–4)                | `gap`                      | Responsive grid; no horizontal overflow at mobile width      |
| `card`       | `children`                                 | `title`                    | Bordered content group                                       |
| `when`       | `bind`, `equals`, `children`               | —                          | Render children iff `state[bind] === equals`                 |
| `heading`    | `level` (1–4), `text`                      | —                          | Semantic `h1`–`h4`                                           |
| `markdown`   | `text`                                     | —                          | Safe CommonMark; links allowed subject to URL policy         |
| `text`       | `text`                                     | —                          | Plain text, never treated as HTML                            |
| `divider`    | —                                          | —                          | Horizontal rule                                              |
| `chart`      | `kind` (`bar`/`line`), `dataset`, `x`, `y` | `title`                    | Responsive SVG chart sourced from a dataset                  |
| `table`      | `dataset`                                  | `editable` (default false) | Accessible table; edit only editable columns                 |
| `toggle`     | `bind`, `label`                            | —                          | Changes boolean state                                        |
| `input`      | `bind`, `label`, `kind` (`text`/`number`)  | —                          | Changes matching string/number state                         |
| `stateValue` | `bind`                                     | `prefix`, `suffix`         | Display current primitive state as text; `null` displays `—` |

Rules:

- `children` are always an ordered array of nodes, never untyped JSON blobs.
- Root node **MUST** be one of `column`, `row`, `grid`, or `card`.
- `gap` uses a viewer-defined spacing scale. Exact visual spacing is **not** serialized in pixels.
- `row` and `grid` must adapt to narrow viewports. A declared 4-column grid may render as fewer columns on mobile.
- No custom style strings, HTML attributes, CSS selectors, code blocks that execute, raw SVG, remote embeds, event-handler JavaScript, or `onClick` functions.
- A document generated by an AI should use these exact node types; unknown types are validation errors rather than ignored content.
- `when` compares scalar JSON values strictly; there is no expression language or nesting into data objects in v0.1.
- `markdown` supports standard text formatting, lists, blockquotes, code spans, code fences, and links. Full GFM tables are optional because `table` is a first-class component. **Raw HTML is disabled.** Images in Markdown are disabled in v0.1.

### 3.5 Datasets, typing, and editing

```json
{
  "datasets": {
    "sales": {
      "columns": [
        { "key": "month", "label": "Month", "kind": "string" },
        { "key": "revenue", "label": "Revenue", "kind": "number", "editable": true }
      ],
      "rows": [{ "id": "jan", "month": "Jan", "revenue": 1200 }]
    }
  }
}
```

- Each dataset has `columns` and `rows`; supported column kinds are `string`, `number`, and `boolean`.
- Each row has a unique stable `id`. Row IDs **MUST** be unique within that dataset.
- `id` is reserved for row identity and **MUST NOT** be a declared column key (approved schema amendment D003). Row identity is not an editable cell.
- Each row **MUST** have exactly `id` plus every declared column key; no other keys are allowed. Use `null` to represent a missing cell value. This cross-field rule is enforced by the **semantic validator**.
- Non-null cell values **MUST** match the declared column kind. No coercion while loading.
- Only a `table` with `editable: true` **and** a column with `editable: true` permits edits.
- On edit, validate the new value. Apply a targeted, immutable update to the document store; do not mutate the original parsed JSON in place.
- Any `chart` bound to that dataset must reflect valid edits without reparsing the full document.
- Save/download exports current data and state values, so edits survive reopening.
- In v0.1 tables support editing existing cells only: no row insertion/deletion, sorting, filtering, formulas, or CSV import.

### 3.6 Chart semantics

- `dataset` is a key in `datasets`; `x` and `y` are column keys in that dataset.
- `x` type is `string` or `number`. `y` type **MUST** be `number`.
- Null `x`/`y` rows are skipped for charting, not treated as zero.
- Preserve dataset row order; do not silently sort.
- Support negative and positive finite numbers; bar charts show a zero baseline, line charts show a numerically appropriate y-axis range.
- Render with an internal minimal SVG implementation. Avoid heavyweight chart libraries in v0.1.
- Provide a text accessible summary or a data-table alternative for screen-reader users. Tooltips are optional, and must not be the only source of information.

### 3.7 State and controls

- `state` is a flat map of strings, numbers, booleans, or `null`.
- All numeric values throughout the document must be finite, including values supplied directly in memory. Keep strict-number schema validation enabled and type coercion disabled. A syntactically valid literal such as `1e400` must be rejected if it overflows during parsing (D008).
- `toggle.bind` must point to an existing **boolean** state key.
- `input.kind: "text"` requires an existing **string** key; `"number"` requires a **number** key.
- `stateValue` and `when` bindings must refer to existing state keys.
- Inputs update only their own bound state key. No arbitrary event/action scripting.
- For number inputs, invalid intermediate text is local to the input UI; only commit a valid finite number to state. Do not quietly commit `NaN`, `Infinity`, or a string.
- On document export, serialize the latest committed state values.

### 3.8 Versioning and compatibility

- Format version is a string with exact v0.1 compatibility semantics: `"0.1.0"` only.
- Viewer should report `UNSUPPORTED_VERSION` for a different version, not try to guess the intended interpretation.
- In later versions, introduce explicit migrations (`migrateDocument`) rather than silently changing old documents.
- Missing optional properties use documented defaults. Unknown fields are rejected for now.

---

## 4. Limits and validation behavior

The following are **v0.1 safety and resource limits** (not long-term limits):

| Limit                                   |                    Value | Enforcement                                                |
| --------------------------------------- | -----------------------: | ---------------------------------------------------------- |
| Raw `.mosa` bytes                       |                    5 MiB | Reject before JSON parsing                                 |
| Total document nodes                    |                    2,000 | Iterative resource preflight                               |
| Max tree depth                          |                       20 | Iterative resource preflight                               |
| Named datasets                          |                       20 | Schema and semantic validation                             |
| Columns per dataset                     |                       30 | Schema                                                     |
| Rows per dataset                        |                    1,000 | Schema                                                     |
| Total dataset cells across all datasets |                   20,000 | Semantic validation                                        |
| Data points per chart                   | 500 after skipping nulls | Semantic validation (or explicit user-visible limit error) |
| Markdown characters per node            |                   20,000 | Schema                                                     |
| Persistent state keys                   |                      100 | Schema                                                     |

Before invoking the versioned JSON Schema validator, perform an **iterative resource preflight** for node count and node-tree depth. Reject cyclic in-memory input to `validateMosaic` before recursive schema validation. Then run the schema validator, followed by a **single bounded semantic traversal** for properties JSON Schema cannot conveniently express: global node ID uniqueness, root kind, binding resolution, dataset column uniqueness and reserved names, row ID uniqueness, complete row shape, cell types, total cells, chart compatibility, and chart point cap. This approved ordering amendment (D002) protects the schema validator itself; it does not replace either validation layer.

Count the root at depth **1** and include it in the node count. Include all descendants, even hidden conditional content. Count dataset cells as the sum of `rows × declared columns`, including null cells and excluding row IDs. Count chart points separately per chart after skipping rows with either selected value null. Exactly the limit is allowed; one over is rejected (D004).

Validator API:

```ts
type MosaicError = {
  readonly code: MosaicErrorCode;
  readonly path: JsonPointer; // RFC 6901 string form; empty string means whole document
  readonly message: string; // clear and human-readable
};

type ParseResult =
  | { readonly ok: true; readonly document: MosaicDocument }
  | { readonly ok: false; readonly errors: readonly [MosaicError, ...MosaicError[]] };

function parseMosaic(input: string): ParseResult;
function validateMosaic(value: unknown): ParseResult;
function serializeMosaic(document: MosaicDocument): string;
```

Fixed error codes: `FILE_TOO_LARGE`, `INVALID_UTF8`, `INVALID_JSON`, `UNSUPPORTED_VERSION`, `SCHEMA_ERROR`, `DUPLICATE_ID`, `INVALID_ROOT`, `INVALID_BINDING`, `INVALID_DATASET`, `RESOURCE_LIMIT`.

The shared contracts live in `src/core/errors.ts`, `src/core/json-pointer.ts`, and `src/core/limits.ts`. See [core-contracts.md](core-contracts.md) for classification rules and helper usage. Published safety-ceiling violations use `RESOURCE_LIMIT`, except file size uses `FILE_TOO_LARGE`; other schema bounds remain `SCHEMA_ERROR`. Markdown character limits follow JSON Schema's Unicode code-point semantics. These definitions do not by themselves implement the import/validation pipeline.

**Important:** `JSON.parse` input in JavaScript is already a string. The file loader enforces raw byte size and strict UTF-8 decoding (e.g., `TextDecoder("utf-8", { fatal: true })`) _before_ calling the parser. The public parser should also guard unusually large text via UTF-8 byte count or an equivalent documented safeguard. Avoid deep unbounded recursion; validate depth as you traverse, and use an explicit stack where practical.

Serialization:

1. Validate the current in-memory document first.
2. Write only format fields (exclude transient UI state).
3. Serialize as `JSON.stringify(doc, null, 2) + "\n"` in v0.1.
4. Preserve array order, node IDs, row IDs, and numeric values. Round-tripping should be structurally equivalent; exact whitespace preservation is not required.
5. Block export with a clear validation error if edits created an invalid document.
6. Measure the final serialized output in UTF-8 bytes before download. Reject output over **5 MiB (5 × 1,024 × 1,024 bytes)** and preserve all in-memory edits. Do not truncate, silently minify, or raise the limit. A near-limit minified input may open successfully but require content reduction before its formatted export fits the limit (D005).

---

## 5. Rendering engine and app UX

### 5.1 Component registry

Build a **closed, typed** mapping of node `type` to renderer components; avoid a dynamic module loader driven by document data.

```ts
const registry = {
  column: ColumnNode,
  row: RowNode,
  grid: GridNode,
  card: CardNode,
  when: WhenNode,
  heading: HeadingNode,
  markdown: MarkdownNode,
  text: TextNode,
  divider: DividerNode,
  chart: ChartNode,
  table: TableNode,
  toggle: ToggleNode,
  input: InputNode,
  stateValue: StateValueNode,
} satisfies Record<MosaicNode['type'], React.ComponentType<any>>;
```

This is **illustrative**: keep implementation strongly typed where possible and avoid `any` leaking into component props. Renderer behavior must be driven exclusively by validated values.

### 5.2 Application screens

**Initial screen:** project title, “Open `.mosa`”, “Open demo”, drag-and-drop zone, short explanation.  
**Document screen:** compact header; Preview / Source tabs; Import/Replace, Download, Reset demo controls; validation errors with JSON paths.  
**Preview:** responsive, readable content, tables and SVG charts.  
**Source:** lightweight read-only formatted JSON first; do not pull in Monaco/CodeMirror solely for v0.1. If time permits, add an explicit “Edit JSON” mode with an Apply button that validates before replacing preview.  
**Unsaved changes:** set dirty flag after data/state edits; warn before discarding or replacing the open document. Never silently overwrite the user's original file.

A preview/source **split view is optional**, not required for release. No automatic file-system permissions are needed: `input[type=file]` + `File`/`Blob` for import, and `Blob` + object URL for download. Revoke created object URLs after use.

### 5.3 Responsiveness, accessibility, and speed

- Default to system fonts. No remote fonts or icon CDN.
- Use CSS grid/flex layouts and a small stylesheet driven by theme tokens.
- Provide visible focus, keyboard-operable controls, semantic headings/tables, labels for inputs, chart alt-summary, and clear errors.
- Use stable React keys based on node IDs and row IDs. Update only affected table rows/cells and subscribed charts where practical.
- Do not mount 1,000 visible table rows unnecessarily; add simple row virtualization or progressive rendering when datasets exceed **100 rows**. Favor a tiny, auditable implementation; benchmark before introducing a dependency.
- Chart SVG should cap tick marks and labels; handle zero/negative values and empty datasets gracefully.
- Render without requiring network calls after the application bundle is loaded.

---

## 6. Security, privacy, and threat model

A `.mosa` file is **untrusted input**, including when generated by an AI.

| Threat                                | Mandatory defense                                                                                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Script injection in Markdown          | Raw HTML disabled; do not use `dangerouslySetInnerHTML` or `rehype-raw`                             |
| `javascript:` or unsafe links         | Accept only `https:`, `http:`, `mailto:` and safe same-document anchors; use secure link attributes |
| Arbitrary executable document content | No code execution, `eval`, `Function`, custom scripts, event handlers or inline HTML                |
| Huge/deep/hostile document            | Byte limit, count/depth/cell limits, structured errors, no uncontrolled recursion                   |
| Dangerous object keys                 | Strict key regex + explicitly reject prototype-pollution keys                                       |
| Silent data exfiltration              | No document-controlled URLs for scripts, fonts, images, fetch, beacons, or embeds                   |
| Malicious SVG content                 | Generate SVG programmatically using trusted renderer, never inject SVG strings from file            |
| Unexpected data loss                  | Editing modifies in-memory copy; download as new file; warn on discard                              |

Use `react-markdown` **without raw HTML**, with a strict URL policy and no custom unsafe plugins. A Content Security Policy that disallows inline scripts, `eval`, external connections, and object embeds is defense in depth when the app is served from a host; avoid CSP rules that break the built application. Keep dependencies audited and pinned to lockfile versions.

No telemetry, document uploads, analytics, AI API calls, or automatic external requests in v0.1. Links clicked intentionally by users may navigate to external sites.

---

## 7. Performance and complexity targets

These are **engineering targets, not established benchmarks**. Report measurements rather than asserting they are met.

### 7.1 Reference environment and methodology

- Choose and record one reproducible desktop-browser/hardware profile (e.g., Chrome stable on a representative 2020-era laptop). Record CPU, RAM, browser version, build type, throttling profile.
- Use the optimized production build, warm cache, no dev tooling overhead.
- Run each benchmark at least 10 times; record median and p95, alongside input size and node count.
- Include small (3 KiB), medium (~100 KiB / 300 nodes), and large (~1 MiB / up to 2,000 nodes) fixture classes; generate synthetically valid fixtures under all safety caps.

### 7.2 Initial budgets

| Metric                                             | Target (reference device, production build)                   |
| -------------------------------------------------- | ------------------------------------------------------------- |
| Example `.mosa`                                    | < 10 KiB (readable JSON)                                      |
| App initial JS payload                             | Aim ≤ 250 KiB gzip; investigate if higher                     |
| 1 MiB file: read/decode/parse/validate             | Median ≤ 200 ms                                               |
| 300-node document: initial render after validation | Median ≤ 500 ms                                               |
| Single edited cell: affected chart update          | Median ≤ 100 ms                                               |
| Network calls caused by opening a local document   | 0                                                             |
| 100 repeated open/close cycles                     | No persistent linear memory growth after GC; inspect manually |

Do **not** artificially optimize to hit these numbers by reducing correctness. Record baseline values with any miss and the likely bottleneck. Prefer `React.memo`/targeted state subscriptions only where profiling shows value. Consider dynamic imports for source-view tooling and Markdown rendering if bundle targets are missed.

### 7.3 Complexity model

Let `B` be file bytes, `N` node count, `C` total dataset cells, `V` rendered/visible UI elements, and `P` plotted data points.

- JSON decoding/parsing: expected `O(B)` time and `O(B)` memory for the parsed representation.
- Schema + semantic validation: target `O(B + N + C)` work with bounded depth and key lookups; actual schema validator overhead may vary.
- Initial rendering: work proportional to visible node elements and chart points, roughly `O(V + P)` excluding browser layout/paint complexity.
- Editing one indexed cell: target `O(1)` lookup/update _before_ immutable-copy costs and component notifications; avoid revalidating or rerendering every unrelated node on each keystroke.
- Document storage: `O(B + N + C)` representation, plus normal DOM/runtime overhead. **Do not claim literal constant-time updates or zero-copy objects without measuring.**

A compressed container can come in v0.2+ if real measurements show text JSON is insufficient. Compression often reduces disk size but raises decoding/CPU costs and complexity.

---

## 8. Technology choices (v0.1)

| Area             | Choice                                                  | Reason                                            |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------- |
| Language         | TypeScript (strict mode)                                | Tagged node unions, safer data updates            |
| App shell        | Vite + React                                            | Fast development, static production build         |
| Schema           | JSON Schema Draft 2020-12                               | Portable, machine-readable generation contract    |
| Schema validator | Ajv (2020-12-compatible configuration)                  | Runtime validation; compile validator once        |
| Markdown         | `react-markdown`                                        | Component-based rendering, no raw HTML by default |
| Charts           | Handwritten minimal SVG renderer                        | Avoid a large chart dependency in first release   |
| State            | React state/context or tiny store                       | No Redux required                                 |
| Styling          | Plain CSS + design tokens                               | Low runtime overhead                              |
| Tests            | Vitest + React Testing Library + Playwright smoke tests | Unit, component, browser coverage                 |
| Accessibility    | Semantic HTML and keyboard tests                        | Basic inclusive usability                         |

Pin compatible package versions in `package-lock.json`/equivalent lockfile, not hard-coded guesses in this document. Use the minimum supported Node version required by the selected Vite release. Do not introduce large dependencies without a brief size/performance justification.

### Reference documentation

- JSON Schema Draft 2020-12: https://json-schema.org/draft/2020-12
- Vite setup: https://vite.dev/guide/
- React Markdown and security: https://github.com/remarkjs/react-markdown
- Browser File API: https://developer.mozilla.org/en-US/docs/Web/API/File_API
- Content Security Policy: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP

---

## 9. Suggested repository layout

Keep a **single app repository** in v0.1; modularize directories instead of creating a monorepo immediately.

```text
mosaic/
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── docs/
│   ├── SPEC_V0.1.md             # copy/link of this plan
│   ├── decisions.md
│   └── benchmarks.md
├── schema/
│   └── mosaic-v0.1.schema.json
├── examples/
│   ├── mosaic-demo.mosa
│   └── invalid/               # negative fixtures
├── scripts/
│   ├── validate-example.ts
│   └── benchmark.ts
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── FileToolbar.tsx
│   │   ├── SourceView.tsx
│   │   └── ErrorPanel.tsx
│   ├── core/
│   │   ├── types.ts
│   │   ├── parse.ts
│   │   ├── validate.ts
│   │   ├── serialize.ts
│   │   ├── store.ts
│   │   └── file.ts
│   ├── render/
│   │   ├── NodeRenderer.tsx
│   │   ├── MarkdownNode.tsx
│   │   ├── LayoutNodes.tsx
│   │   ├── ChartNode.tsx
│   │   ├── TableNode.tsx
│   │   └── ControlNodes.tsx
│   ├── styles/
│   │   └── global.css
│   └── main.tsx
├── tests/
│   ├── parser.test.ts
│   ├── semantics.test.ts
│   ├── rendering.test.tsx
│   ├── interactions.test.tsx
│   ├── security.test.tsx
│   └── e2e/
│       └── mosaic.spec.ts
└── public/
```

Keep `schema/` as the source of truth for the format. Generate or type-check TypeScript interfaces against it where practical. Avoid maintaining two divergent specifications manually; a dedicated semantic validation module covers cross-reference rules JSON Schema cannot express.

---

## 10. Development milestones (execute in this order)

### Phase 0 — Initialize and establish contracts

**Tasks**

- [x] Create Vite React/TypeScript project with strict TS config, ESLint and formatting.
- [x] Copy the schema and example into `schema/` and `examples/`.
- [x] Add `README.md`, `docs/decisions.md`, and npm scripts for development, build, typecheck, lint, test, and format check.
- [x] Run JSON Schema validation on `mosaic-demo.mosa` before adding UI code.
- [x] Define the type unions in `src/core/types.ts` aligned with the schema.

**Acceptance:** `npm install`, `npm run dev`, `npm run build`, and typecheck pass; the example validates; README describes how to start.

**Completed:** 2026-11-13. See [Phase 0 verification](phase-0.md) for commands, results, and the dependency-audit limitation. No Phase 1 implementation is included.

### Phase 1 — Parser, validator, serializer (core)

**Tasks**

- [x] Define structured errors/results, JSON Pointer helpers, shared resource ceilings, inclusive limit diagnostics, and counting conventions (step 1, 2026-11-14).
- [x] Read files, guard the inclusive 5 MiB limit, decode strict UTF-8, handle one leading BOM, reject duplicate JSON members, and report syntax and version errors.
- [x] Run iterative node-count, depth and cycle checks before schema validation, including for direct in-memory inputs.
- [x] Complete `parseMosaic` and `validateMosaic` with the typed document result.
- [x] Implement `serializeMosaic` and verify the export byte limit and roundtrip.
- [x] Compile the JSON Schema validator once per module instance and run it behind preflight.
- [x] Validate node and row identity, layout roots, dataset declarations and cells, state and dataset references, chart compatibility, and aggregate limits.
- [x] Return structured errors with JSON Pointer paths and a distinct unsupported version code.
- [x] Add tests for malformed JSON, wrong version, unknown nodes, duplicate IDs, invalid types, oversized/deep documents, and successful roundtrip.

**Acceptance:** Valid examples parse/export; invalid input fails safely with actionable errors; 100% of specified semantic rules have direct tests.

### Phase 2 — Read-only viewer and file workflow

**Tasks**

- [x] Implement the component registry and `NodeRenderer`.
- [x] Render text, Markdown, heading, column, row, grid, card, divider.
- [x] Per D006, evaluate `when` and display `stateValue` using initial state; show input/toggle controls disabled and explicit placeholders for known chart/table nodes. Unknown node types remain validation errors.
- [x] Build a minimal responsive app shell with Open Demo, Open File, drag/drop, Preview, Source, and ErrorPanel.
- [x] Implement safe Markdown URL policy and disable HTML/images.
- [x] Add responsive layouts, system font, light/dark theme tokens and keyboard focus styling.

**Acceptance:** Demo can be opened and displayed offline after app assets are available; valid Markdown renders safely; malformed files do not crash; mobile-width layout works.

Verified with the production build in headless Chromium and WebKit. The browser suite loads the viewer before disabling the network and opening the demo. It checks request attempts, malformed-file diagnostics and recovery, keyboard focus, safe Markdown, and computed theme styles. A four-column fixture renders four columns at 1280 CSS pixels and one at 375 and 320, with wide code and Source scrolling inside their panels. See the [browser tests](../tests/browser/viewer.spec.ts) and the [run instructions](../README.md#verify-the-production-viewer).

### Phase 3 — Datasets, tables, SVG charts

**Tasks**

- [x] Build a small document store with datasets keyed by name and rows keyed by stable IDs.
- [x] Render accessible table with typed cell display.
- [x] Replace Phase 2 chart/table placeholders; keep state controls read-only until Phase 4.
- [x] Implement `bar` and `line` charts using responsive SVG with zero/negative ranges, axes, and an accessible summary.
- [x] Make table cells editable only when table and column permissions both allow it.
- [x] Wire shared datasets so successful cell edits update bound charts.
- [x] Add bounded rendering for >100 rows; benchmark any virtualization decision. The viewer uses progressive rendering in batches of up to 100 rows.

**Acceptance:** Editing the demo's numeric cell updates the chart; invalid edits show feedback and do not corrupt data; column/table permissions enforced.

### Phase 4 — State, controls, persistence via download

**Tasks**

- [x] Add typed state updates to the document store with immutable snapshots, existing-key checks, control binding compatibility, and finite-number validation.
- [x] Enable mutations for `toggle` and `input`, and reactive updates for `stateValue` and `when`, building on their Phase 2 read-only rendering; use typed state changes.
- [x] Export current datasets and state via new `.mosa` download.
- [x] Re-import exported file and verify structural equivalence and persisted edits.
- [x] Track unsaved changes; warn before replacing a modified document.
- [x] Ensure open/download flows use local browser File/Blob APIs only.

**Acceptance:** Controls update content immediately; edits survive export/reimport; zero document-related network requests.

**Workflow verification:** The production viewer completes cell/state edits, real downloads, and reopening in independent preloaded viewers while offline in Chromium and WebKit. Both hidden and visible chart states, numeric conditions, typed cells, invalid draft exclusion, and exact export bytes are checked. See [the Phase 4 verification report](phase-4.md) for the tested scope and generated evidence.

### Phase 5 — Hardening, testing and benchmark report

**Tasks**

- [x] Add malicious Markdown and prototype-key regression tests.
- [x] Test the specified malformed/corrupt/over-limit cases; make error UI understandable.
- [x] Add keyboard/a11y smoke tests, narrow-screen browser test and E2E file open/edit/export/reopen.
- [x] Benchmark small/medium/large fixtures, production bundle size, document load, chart update, repeated open/close. The viewer has no Close action; benchmarks replace each document with a minimal valid baseline.
- [ ] Profile and address actual bottlenecks, keeping features unchanged.
- [ ] Document known limits, security choices, test results, and v0.1 compatibility contract.

**Acceptance:** Definition of Done below is met; `docs/benchmarks.md` includes hardware, measured medians/p95, and any missed targets. Do not state "optimized" without numbers.

The [security audit](security-audit.md) records the covered cases, the Markdown renderer fix, and remaining boundaries. The full Phase 5 acceptance work is not yet complete.

The [error recovery verification](error-recovery.md) exercises rejected files through Open File and drop in Preview and Source, exact byte boundaries, preservation of edits and drafts, failed/stale reads, and successful export/retry. No runtime change was needed for this verification.

The [accessibility and browser report](accessibility.md) records complete keyboard workflows, semantic labels and error feedback, conditional-focus recovery, Markdown scrolling/link fixes, narrow-screen text resizing, theme contrast, and the limits of automated verification.

The [production benchmark report](benchmarks.md) records reference hardware, fixture shapes, timing and memory samples, bundle sizes, and remaining profiling questions. Completing measurement does not mark the profiling or final release-report tasks complete.

---

## 11. Testing checklist and fixtures

### Unit / schema

- [x] Valid sample passes schema and semantic validation.
- [x] No data field or state value is silently coerced.
- [x] Unexpected top-level/node properties rejected.
- [x] Duplicate node IDs / dataset column keys / row IDs rejected.
- [x] Missing state binding and missing dataset columns rejected.
- [x] Chart with nonnumeric y rejected; null points handled.
- [x] Over-limit bytes/depth/node count/cell count/chart points rejected.
- [x] Wrong version gives `UNSUPPORTED_VERSION`.
- [x] Serializer roundtrip preserves structure and saved values.
- [x] Validation and serialization preserve input on success and failure.
- [x] A generated document at all ten inclusive resource ceilings survives parse–serialize–parse.

### UI and editing

- [ ] Heading hierarchy and Markdown look correct.
- [x] Small screens show no accidental horizontal page overflow.
- [x] Editable cells have accessible labels and honor type restrictions.
- [x] Editing source data updates dependent chart without reloading entire file.
- [x] Toggle hides and restores conditional region.
- [x] Text input updates state display; invalid number input cannot corrupt state.
- [x] Downloaded file reopens with persistent edits.
- [x] Open-replace warns about unsaved edits.

### Security / robustness

- [x] `<script>` in Markdown is shown as inert text or omitted, never executed.
- [x] `javascript:` links cannot execute.
- [x] SVG/HTML snippets from documents cannot become executable DOM.
- [x] Large hostile nesting fails gracefully.
- [x] Invalid encoding and invalid JSON show actionable messages.
- [x] Importing a file never initiates a document-controlled fetch.
- [x] Reserved dataset, state, and column names and references are rejected.

### Format fixtures

- `mosaic-demo.mosa` — gold sample with Markdown, chart, editable table, conditional and text input.
- `examples/invalid/unsupported-version.mosa`
- `examples/invalid/duplicate-node-id.mosa`
- `examples/invalid/missing-binding.mosa`
- `examples/invalid/wrong-column-type.mosa`
- `examples/invalid/malicious-markdown.mosa` (valid v0.1 Markdown content, retained for later renderer checks)
- Synthetic medium/large valid documents generated in benchmark tests, not committed if huge.

---

## 12. Developer interface and commands

Set up these scripts (implementation may name the validation script slightly differently, but document any change):

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
npm run validate:example
npm run benchmark
```

CLI tool for arbitrary input files (`mosaic validate file.mosa`) is **optional** in v0.1. Do not block shipping the browser viewer to build a standalone CLI.

Recommended public core functions (even if package is not published):

```ts
parseMosaic(text: string): ParseResult;
validateMosaic(input: unknown): ParseResult;
serializeMosaic(doc: MosaicDocument): string;
updateCell(doc: MosaicDocument, dataset: string, rowId: string,
           columnKey: string, value: string | number | boolean | null): MosaicDocument;
updateState(doc: MosaicDocument, key: string,
            value: string | number | boolean | null): MosaicDocument;
```

`updateCell` and `updateState` must reject invalid changes with clear typed errors; a cleaner Result return type is fine. Choose one immutable update strategy consistently.

---

## 13. AI generation contract

The _format_ should work well with or without an AI. v0.1 does not call an AI service; users can produce `.mosa` externally or by hand.

An AI adapter should be able to receive the JSON Schema plus a short component guide and produce a valid document. For reliable generation:

1. Instruct the model to output **one JSON object only**, with exact `"mosaic": "0.1.0"`.
2. Permit only the defined node types and properties; require stable unique IDs.
3. Generate `datasets` and `state` before referencing them from nodes.
4. Generate semantic text in Markdown strings; do not include HTML/JS/CSS.
5. Validate output locally; return precise schema/semantic errors to a repair loop if needed.
6. Do not auto-run, auto-publish, or give generated documents additional permissions.

**Sample prompt for a separate AI adapter:**

> Produce a Mosaic `.mosa` document that visualizes monthly revenue with one editable table, one bar chart bound to that table, an explanatory Markdown section, and a toggle that shows/hides the chart. Output strict UTF-8-compatible JSON matching Mosaic schema version `0.1.0`. Use unique node IDs, existing dataset/state bindings, and no HTML, CSS, JavaScript, URLs to assets, or unsupported components. Prefer simple layouts and concise content.

Future model-specific prompt engineering is deliberately outside the format specification.

---

## 14. Release checklist / Definition of Done

**Mosaic v0.1 is ready when all statements below are true:**

- [ ] A newcomer can clone repo, install dependencies, and run the app from README.
- [ ] Schema, example document, and documented semantics agree.
- [ ] Local `.mosa` import, safe validation, preview, controls, editing, and export work.
- [ ] Demo includes Markdown, responsive layout, chart, editable table, input, toggle, and conditional rendering.
- [ ] Exported changes persist on re-import.
- [ ] Unknown/invalid/hostile documents fail with clear errors rather than crashes or execution.
- [ ] No network, account, server, AI key, or external fonts are required for local document processing.
- [ ] Unit/integration/browser smoke tests pass (actual results reported).
- [ ] Bundle size and representative parse/render/edit timings are measured and documented.
- [ ] Known limitations are plainly listed; no unsupported performance claims.

### Explicit future work, **not** in v0.1

- v0.2: `.mosz` compressed/asset package after benchmarking; static diagrams/flowcharts; selection/editing GUI; simple formulas.
- v0.3: true canvas/whiteboard, richer chart libraries (conditionally loaded), richer tables, document migrations and richer exports.
- Later: sandboxed programmable components, collaborative editing, 3D, plugins, cloud synchronization, AI-driven UI regeneration and partial updates with explicit permissions.

Future versions need a published compatibility policy, conformance tests, and an extension mechanism. The working name **Mosaic** and `.mosa` extension also require collision/trademark checks before public launch.

---

## 15. Suggested sequence of Codex instructions

Provide this file and both companions to Codex. Then work through these prompts instead of asking for the whole product in one unreviewed change:

1. **Foundation:** “Implement Phase 0 and Phase 1 of `MOSAIC_V0.1_TECHNICAL_SPEC_AND_BUILD_PLAN.md`. Follow `mosaic-v0.1.schema.json` as the contract. Set up tests for every parser/semantic rule. Report commands actually run.”
2. **Read-only viewer:** “Implement Phase 2. Open `mosaic-demo.mosa` locally, render the supported static nodes, and handle import/errors securely. Run tests and build.”
3. **Reactive data:** “Implement Phase 3. Add dataset store, editable table, and minimal accessible SVG bar/line charts. Validate edits and update charts from shared data.”
4. **Interactions and saving:** “Implement Phase 4, including toggle/input/conditional/stateValue and round-trip `.mosa` export. No cloud or scripts.”
5. **Shipping:** “Implement Phase 5. Run all tests and production benchmark suite, record honest results, fix regressions, and produce a clear final release report.”

**Original suggested first prompt:** implement Phase 0 and Phase 1, then show the directory tree, test output, and any spec ambiguities encountered. This is reference guidance, not current authorization. Follow the owner's explicitly requested phase; do not build speculative v0.2 features until v0.1 is stable.
