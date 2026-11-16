# Mosaic

Mosaic is a local-first visual document format and viewer. A `.mosa` document is UTF-8 JSON with a closed component vocabulary and exact format version `0.1.0`.

The Phase 1 core supports safe parsing, full v0.1 validation, and serialization. Run `npm run validate:example` to read the reference file and check its resource limits, schema, and semantics.

Phase 0 is complete. See the [verification report](docs/phase-0.md) for results and the development dependency audit limitation.

See [core contracts](docs/core-contracts.md) for error classifications, pointer conventions, resource counting, examples, and the boundary between definitions and validation enforcement.

## Development environment

- Node.js **22.13+ on the 22.x line**, **24.x**, or **26+**; npm **10+**. The combined toolchain determines this minimum. `.nvmrc` pins the locally verified Node version, **22.18.0**.
- No `.env` file, API key, database, account, or backend is needed.
- Dependency installation requires npm registry access. Installed app code and assets are served locally; the foundation uses no remote fonts or assets.

With an existing Node installation that satisfies `package.json`:

```sh
npm ci
npm run dev
```

If you use nvm, run `nvm install` and `nvm use` first. Open the localhost URL printed by Vite (normally `http://127.0.0.1:5173`). Choose **Open Demo** for the bundled reference document, choose **Open File**, or drop a single `.mosa` file anywhere in the viewer. Use Ctrl+C to stop the server.

A successful open selects **Preview**. **Source** displays the complete validated document as read-only, two-space-indented JSON. Formatting happens when you select the tab, so a compact file that fits the import limit can still be inspected if indentation takes its displayed source past 5 MiB. The arrow keys, Home, and End switch between focused tabs.

File contents are read and validated locally. When opening a replacement fails, the viewer keeps the current document and tab. The error panel identifies the attempted file and displays each validator message, error code, and JSON Pointer. An empty pointer appears as `""` (document root). A file read failure has a separate retry message.

`npm ci` installs the committed lockfile exactly. `npm install` also works for initial setup or intentional dependency changes. Direct dependency versions are exact; do not update them automatically.

## Commands

| Command                    | Purpose                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`              | Start Vite on the loopback interface.                                     |
| `npm run typecheck`        | Check strict TypeScript across source, scripts, tests, and configuration. |
| `npm run lint`             | Run ESLint with zero warnings allowed.                                    |
| `npm run test`             | Run format, renderer, and file workflow tests once.                       |
| `npm run test:viewer`      | Build and run the production viewer smoke tests in Chromium and WebKit.   |
| `npm run test:watch`       | Watch tests during development.                                           |
| `npm run validate:example` | Run full v0.1 validation on the reference file.                           |
| `npm run format:check`     | Check formatting without editing files.                                   |
| `npm run format`           | Apply formatting; preserve supplied reference files.                      |
| `npm run build`            | Typecheck and create the static production build in `dist/`.              |
| `npm run preview`          | Serve the production build locally.                                       |
| `npm run check`            | Run typechecking, lint, formatting, Vitest, demo validation, and build.   |

The file workflow tests use React Testing Library and Happy DOM. The other Vitest suites run in Node. Benchmark tooling is scheduled for Phase 5.

### Verify the production viewer

After `npm ci`, install the Playwright browsers once, then run the suite:

```sh
npx playwright install --only-shell chromium webkit
npm run test:viewer
```

The suite builds the app and serves it on `127.0.0.1:4174` for the duration of the run. The offline checks load the app assets, disable networking for that browser context, then open the bundled demo or a local file. They also count request attempts, including requests that would fail offline. The other checks cover malformed-file recovery, responsive layout at 320, 375, and 1280 CSS pixels, computed theme styles, keyboard focus, and the DOM produced by Markdown.

## Contract and source layout

```text
docs/
  SPEC_V0.1.md                 Working specification with approved amendments
  decisions.md                 Accepted decisions and implementation status
  core-contracts.md             Errors, pointers, resource budgets, and counting rules
  reference/                   Unmodified supplied plan and schema
schema/
  mosaic-v0.1.schema.json       Authoritative structural contract
examples/
  mosaic-demo.mosa              Unmodified reference document
  invalid/                     Format fixtures and literal Markdown sample
scripts/
  schema-validator.ts          Schema conformance helper for tests
  validate-example.ts          Reference-document validation command
src/
  core/types.ts                Portable types for all 14 node kinds
  core/file.ts                 Local File/Blob reading and byte guard
  core/preflight.ts            Iterative node limits and object cycle checks
  core/schema.ts               Guarded, compiled Draft 2020-12 schema check
  core/validate.ts             Full in-memory validation API
  core/semantics.ts            Dataset, state, node, and chart rules
  core/parse.ts                Parse and validate text into a typed document
  core/serialize.ts            Validate and produce formatted .mosa text
  core/store.ts                Indexed dataset reads and immutable cell edits
  core/dataset-rules.ts        Shared cell-type and chart-point checks
  core/utf8.ts                 Shared UTF-8 text size and encoding checks
  core/source.ts               Byte and text decoding, syntax, and version checks
  core/json-source.ts          Duplicate JSON property scanning
  core/errors.ts               Structured diagnostics and parser result types
  core/json-pointer.ts         Typed diagnostic-path construction and syntax checks
  core/limits.ts               Fixed budgets and shared limit diagnostics
  render/NodeRenderer.tsx      Preview a validated document starting at its root
  render/nodeRegistry.tsx      Typed components for the 14 v0.1 node kinds
  render/MarkdownView.tsx      CommonMark rendering with HTML and images disabled
  render/markdown-policy.ts    Link destinations and document fragment targets
  app/App.tsx                  Demo, file picker, drop handling, and validated replacement
  app/DocumentView.tsx         Preview and formatted Source tabs
  app/ErrorPanel.tsx           Import diagnostics and JSON Pointers
  main.tsx                    React entry point
  styles/global.css           Local stylesheet and system fonts
tests/
  fixtures.ts                 Typed fixtures covering every node kind
  format.test.ts              File diagnostics, immutability, and boundary round trips
  preflight.test.ts           Node limits, graph cycles and validation ordering
  semantics.test.ts           Cross-field validation and aggregate limits
  parser.test.ts              File, byte, and text parsing tests
  serialize.test.ts           Export formatting, round-trips, and final byte limits
  rendering.test.tsx          Component dispatch, layout, nesting, and child order
  markdown.test.tsx           CommonMark output and viewer URL policy
  initial-state.test.tsx      Saved values, conditional content, and read-only controls
  file-workflow.test.tsx      File opening, replacement, recovery, and view switching
  schema.test.ts              Structural contract and regression tests
  errors.test.ts              Diagnostic/result contract tests
  json-pointer.test.ts        Escaping and path-construction tests
  limits.test.ts              Budget, boundary, and schema-agreement tests
```

The working schema differs from the supplied original only by the approved prohibition on a declared column key named `id` (D003). Row `id` remains required metadata. A test guards that precise amendment; the original files remain available for review.

Use `parseMosaic(text)` for JSON text or `validateMosaic(value)` for an in-memory value, including the successful file reader’s `value`. Both return `{ ok: true, document: MosaicDocument }` after preflight, schema, and semantic validation. Failure returns `{ ok: false, errors }` with a code, JSON Pointer, and message for the first violation.

Use `serializeMosaic(document)` to export the current model as two-space JSON with one final LF. It revalidates the document and enforces the inclusive 5 MiB limit on the formatted UTF-8 output. A failed export throws `MosaicSerializationError` with the same `errors` list used by validation. See the [serialization contract](docs/core-contracts.md#serializing-a-document) for boundary behavior.

The Ajv configuration uses Draft 2020-12, strict checks, finite numbers, own-property lookups, and no coercion, default insertion, or property removal. Scalar union types are enabled because the supplied schema uses them. The schema compiles once per core module instance.

## Rendering a validated document

### Document store

`createDocumentStore(opened)` takes the successful result of `parseMosaic` or `validateMosaic`. The viewer creates one store for each file it successfully opens. Preview and Source read the current snapshot.

```ts
const opened = parseMosaic(demoText);
if (opened.ok) {
  const store = createDocumentStore(opened);
  const result = store.updateCell('revenueTable', 'jan', 'amount', 1500);
  if (result.ok) {
    const january = store.getRow('revenue', 'jan'); // amount is now 1500
    const dataset = store.getDataset('revenue'); // rows are still jan, feb, mar
  }
}
```

Lookups return `undefined` for a missing dataset or row. Edits identify the originating table by node ID because two tables can bind to the same dataset with different permissions. Both the table and the column must explicitly enable editing. A changed value publishes a new readonly snapshot and notifies subscribers. An identical value returns the current snapshot. A rejected edit returns structured errors with JSON Pointer paths and leaves the store at its last successful edit.

Row and column positions are indexed once per dataset. Each edit copies the affected row, row array, dataset, dataset map, and document. Filling a null chart coordinate in a dataset with more than 500 rows can require a bounded scan for each affected axis pair. The store checks those charts before publishing the edit, including charts inside hidden conditions.

### Preview

Pass the successful result of `parseMosaic` or `validateMosaic` to the React preview as `<NodeRenderer document={result.document} />`. The renderer starts at `document.root`. Each child keeps its array position and uses its node ID as its React key.

Columns stack children, rows wrap, and grids use the declared column count when space permits. Each grid measures its own available width. It sheds columns as tracks approach 14 rem and can shrink a single track to the width of a narrow card. An explicit gap token from 0 through 6 sets the gap in steps of 0.25 rem. Cards group ordered children under an optional title. Headings use the declared level, text preserves line breaks, and dividers render a horizontal rule.

Opening a validated document applies its `theme` to the viewer. Mode defaults to `system` and follows live changes to the device color scheme. A document can also select `light` or `dark`. The accent is `blue` by default, with `teal` and `amber` alternatives for controls, links, and focus indicators. The default `comfortable` density uses a 0.75 rem layout gap. The `compact` density uses a 0.5 rem default gap and tighter card and panel padding. Explicit node gaps take precedence.

Markdown uses CommonMark for paragraphs, emphasis, lists, quotations, code, and links. The renderer skips raw HTML and drops images before React creates DOM elements. Markup inside a code span or fence displays literally. These rules affect the preview only. The Markdown source stays in the document for serialization.

HTTP and HTTPS links open in a new tab with `noopener noreferrer`. Mail links use the user's mail handler. A fragment such as `#notes` targets the rendered element for the Mosaic node with ID `notes`. DOM targets have a viewer-owned prefix to avoid collisions with the app shell. Other destinations, including relative paths and protocol-relative URLs, display their link label as ordinary content.

The read-only preview uses the saved `state` map. A `when` renders its children in order only if the bound value equals `equals` in both type and value. A `stateValue` displays its optional prefix, the saved value, and its optional suffix. It displays `null` as an em dash and preserves empty strings, zero, and false.

Inputs and checkboxes show their saved values in disabled, labeled controls. Multiline text uses a disabled text area to preserve line breaks. An empty or whitespace-only control label falls back to its binding key. Chart placeholders show the chart title if present and nonblank, or the dataset name otherwise. Table placeholders show the dataset name, including for editable tables.

Run `npm test -- tests/rendering.test.tsx tests/markdown.test.tsx tests/initial-state.test.tsx` to exercise the renderer independently of the app shell.

## Phase boundaries

1. **Phase 0:** environment, schema/types, automated schema checks, documentation, and build.
2. **Phase 1:** bounded parser, full validation, serialization, and format-rule tests.
3. **Phase 2:** read-only viewer, secure local import, safe Markdown, and initial-state rendering.
4. **Phase 3:** datasets, accessible tables, editable cells, and minimal SVG charts.
5. **Phase 4:** state mutations, download persistence, and unsaved-change handling.
6. **Phase 5:** hardening, browser/accessibility checks, and measured production benchmarks.

Cloud services, AI API integration, executable document code, assets, formulas, and other later-version features are outside v0.1. A static build needs a suitable HTTP host; opening `index.html` through `file://` is not a supported deployment method.
