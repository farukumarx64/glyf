# Mosaic

Mosaic is a local-first visual document format and viewer. Open a `.mosa` file, read its layouts and charts, edit the controls its author enabled, and download the updated document. Files use UTF-8 JSON and the exact format version `0.1.0`.

**Current status: a local preview for evaluation.** Public release remains uncleared; browser/accessibility coverage, memory stability, naming and extension decisions are recorded in [release readiness](docs/release-readiness.md). The existing verification includes 609 unit/integration tests and 68 Chromium/WebKit browser tests; see [CI verification](docs/ci.md) for the tested environment, the hosted test-timeout fix and the pending hosted pass.

- [Set up the local viewer](#development-environment).
- [Follow the demo and learn editing/downloads](docs/user-guide.md).
- [Resolve setup and document errors](docs/troubleshooting.md).
- [Check known limitations](docs/user-guide.md#known-limitations) or the detailed [format compatibility contract](docs/compatibility.md).

## Development environment

To run this checkout, install **Git**, **Node.js** and **Bun**, and obtain access to this repository. No account inside Mosaic, `.env` file, API key, database or backend is required. Internet access is needed to clone and install packages; the viewer processes documents locally once its assets have loaded.

- **Node:** the locally verified version is **22.18.0**, pinned in `.nvmrc`. The declared range also accepts 22.x from 22.13, 24.x, and 26+. Use the [official Node 22.18.0 downloads](https://nodejs.org/en/download/archive/v22.18.0), or, if you already use nvm, run `nvm install` and `nvm use` inside the checkout.
- **Bun:** use **1.3.14**, pinned in `package.json`. Follow Bun's [specific-version installation instructions](https://bun.sh/docs/installation#installing-older-versions) or use its [1.3.14 release assets](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14). For a script-based installation on macOS/Linux, the version-specific command is:

```sh
curl -fsSL https://bun.com/install | bash -s "bun-v1.3.14"
```

Reopen the terminal after installation if needed. Check `node --version` and `bun --version`; Bun must print `1.3.14`. An existing installation managed by another tool should be adjusted through that tool so the intended executable is on PATH. [Troubleshooting](docs/troubleshooting.md#setup-and-startup) covers version and PATH failures. Fresh setup has been verified on macOS arm64; other installation environments remain outside that local verification.

From a terminal, clone and enter the project:

```sh
git clone https://github.com/farukumarx64/mosaic.git
cd mosaic
```

If already in a checkout, open its folder in the terminal. After selecting the supported Node and Bun versions, run:

```sh
bun install --frozen-lockfile
bun run dev
```

Open the **Local** URL printed by Vite, normally `http://127.0.0.1:5173`, and choose **Open Demo**. Leave the terminal server running while using the viewer; Ctrl+C stops it. Playwright browser installation is only needed for automated browser tests, not to open the viewer in your own browser.

For a local preview of the production build instead of the development server:

```sh
bun run build
bun run preview --port 4180 --strictPort
```

Open `http://127.0.0.1:4180`. Build before preview and rebuild after changing application code. Serve the app over HTTP(S); opening `dist/index.html` directly with `file://` is unsupported. Public hosting remains subject to the [deployment gates](docs/release-readiness.md#remaining-limitations-and-deployment-gates).

## First document

Choose **Open Demo**, select **Open File**, or drop one `.mosa` file into the viewer. **Preview** shows the document; **Source** shows its current accepted values as read-only JSON. The [user guide](docs/user-guide.md#try-the-demo) walks through changing a table cell, updating a note, hiding a chart, downloading and reopening the result.

Use **Download** to keep accepted edits. It creates a new browser-managed file and does not overwrite the original. Check that the download finished before closing or refreshing: there is no autosave or session recovery. Replacement warnings cover Open Demo, Open File and drop; they do not guard tab closure or navigation. Invalid numeric drafts are not included in the downloaded file. See [saving and replacement](docs/user-guide.md#download-and-reopen) for the details.

## Dependency maintenance

`bun install --frozen-lockfile` uses `bun.lock` and rejects changes that require rewriting it. Keep install scripts enabled: the installation checks the required tool versions and permits esbuild's dependency setup. For intentional dependency changes, use `bun add <package>@<version>` or `bun add --dev <package>@<version>` and review both manifest and lockfile. `bunfig.toml` saves exact direct versions. Use one authoritative lockfile; do not generate an npm lockfile. The [Bun migration report](docs/bun-migration.md) records the verified setup.

When switching an existing npm checkout, stop its dev/test processes, remove only its disposable `node_modules` directory, then run the frozen Bun install. The normal commands regenerate the validator automatically. Use **`bun run test`** for the project's Vitest suite; `bun test` selects a different runner. Pass arguments directly, such as `bun run test tests/store.test.ts`. `bun run playwright` uses the pinned local CLI.

## Commands

| Command                                      | Purpose                                                                                        |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `bun run generate:validator`                 | Precompile the trusted schema into the ignored standalone validator module.                    |
| `bun run dev`                                | Start Vite on the loopback interface.                                                          |
| `bun run typecheck`                          | Check strict TypeScript across source, scripts, tests, and configuration.                      |
| `bun run lint`                               | Run ESLint with zero warnings allowed.                                                         |
| `bun run test`                               | Run format, renderer, and file workflow tests once.                                            |
| `bun run test:viewer`                        | Build and run the production viewer smoke tests in Chromium and WebKit.                        |
| `bun run benchmark`                          | Build and measure production loading, rendering, edits, replacements, memory, and bundle size. |
| `bun run memory investigation chromium 1000` | Compare idle/small/large replacement memory over 1,000 cycles per workload.                    |
| `bun run profile investigation small`        | Capture a production CPU profile and heap snapshots across 500 replacement cycles.             |
| `bun run test:watch`                         | Watch tests during development.                                                                |
| `bun run validate:example`                   | Run full v0.1 validation on the reference file.                                                |
| `bun run format:check`                       | Check formatting without editing files.                                                        |
| `bun run format`                             | Apply formatting; preserve supplied reference files.                                           |
| `bun run build`                              | Typecheck and create the static production build in `dist/`.                                   |
| `bun run preview`                            | Serve the production build locally.                                                            |
| `bun run check`                              | Run typechecking, lint, formatting, Vitest, demo validation, and build.                        |

The file workflow tests use React Testing Library and Happy DOM. The other Vitest suites run in Node. Benchmarks run separately in production Chromium so unit-test timing is not mistaken for browser performance.

### Continuous integration

[GitHub Actions CI](.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatch. A single Ubuntu 24.04 job installs Node from `.nvmrc` and Bun from `package.json`, performs a frozen install, and runs `bun run check` followed by the production Chromium/WebKit suite. This regenerates the standalone validator, checks TypeScript/ESLint/formatting, runs the format and component tests, validates the reference demo, and builds the viewer before browser testing.

Browser checks run with one worker and reject focused `test.only` cases. Available HTML reports and test artifacts are uploaded as **browser-results** for seven days, including failure screenshots and traces. Newer runs cancel superseded runs for the same event/ref. See [CI operation and verification](docs/ci.md) for failure diagnosis, local reproduction and the boundary between automated checks and release approval.

### Verify the production viewer

After `bun install --frozen-lockfile`, install the Playwright browsers once, then run the suite:

```sh
bun run playwright install --only-shell chromium webkit
bun run test:viewer
```

The suite builds the app and serves it on `127.0.0.1:4174` for the duration of the run. The offline checks load the app assets, disable networking for that browser context, then open the bundled demo or a local file. They also count request attempts, including requests that would fail offline. The other checks cover malformed-file recovery, responsive layout at 320, 375, and 1280 CSS pixels, computed theme styles, keyboard focus, and the DOM produced by Markdown.

The complete workflow tests edit cells and state, download real files, and reopen them in an independent viewer while both pages remain offline. They check hidden and visible chart states, numeric conditions, typed values, invalid draft exclusion, exact export bytes, and unsaved status. See the [Phase 4 verification report](docs/phase-4.md) for evidence and scope. Run just these scenarios with `bun run test:viewer tests/browser/complete-workflow.spec.ts`. Generated files, screenshots, and per-case JSON results are written under `test-results/`.

The [security audit](docs/security-audit.md) records attack coverage, the Markdown nesting fix, and verification limits. Run its browser cases with `bun run test:viewer tests/browser/security.spec.ts`.

The [error recovery report](docs/error-recovery.md) covers malformed, corrupt, over-limit and unreadable files, retained edits/drafts, stale reads, real downloads after failure, and successful retries. Run the browser cases with `bun run test:viewer tests/browser/error-recovery.spec.ts`.

The [accessibility report](docs/accessibility.md) records keyboard workflows, labels and live-region checks, conditional-focus recovery, Markdown keyboard access, enlarged-text layouts, theme contrast, and the tested browser scope. Run its browser cases with `bun run test:viewer tests/browser/accessibility.spec.ts`.

### Measure production performance

After installing Playwright Chromium, run `bun run benchmark`. The runner uses loopback ports **4175** and **4176**, with one serial browser workload at a time. It generates validated 3 KiB, 100 KiB, and 1 MiB fixtures; takes 20 timing samples after three warmups; measures 10 loaded-memory samples per fixture; and runs 100 open/replacement cycles per fixture plus an idle memory control. Application assets load before the browser goes offline.

Read [the benchmark report](docs/benchmarks.md) for the reference machine, measured medians/p95, budget comparisons, and memory limitations. Raw samples, heap/DOM checkpoints, hashes, and fixture metadata are written to `benchmark-results/results.json`; generated documents live in `benchmark-results/fixtures/`. This directory is ignored by Git. The separate production measurement harness is also generated there and is excluded from the shipped `dist/` bundle.

The [original benchmark baseline](docs/benchmark-baseline.md) is preserved separately; the main report reflects the optimized release candidate.

Run benchmarks without other test suites or heavy work competing for the machine. The command fails on invalid fixtures, incorrect rendering, browser errors, or document-related requests. Timing targets are reported as measurements, not flaky CI assertions; memory trends require inspection.

The [profiled improvement report](docs/performance-improvements.md) compares the optimized renderer with the original baseline. Unchanged Markdown now reuses its mounted content during cell/state edits, with no global cache. The report also distinguishes V8 warmup from native browser retention and records the unresolved memory-stability limitation. Use `bun run profile investigation small` to capture source-mapped production CPU samples and heap snapshots at 0, 100, 300 and 500 replacement cycles on loopback port **4177**. Generated evidence is written to `benchmark-results/profile-investigation/`.

The [memory follow-up](docs/memory-stability.md) extends replacements to 1,000 cycles in Chromium 159, Chromium 157 (Brave), and WebKit 27.2. Use `bun run memory investigation chromium 1000` on macOS/Linux; select `webkit` for WebKit or supply a local Chromium executable as the final argument. Each workload uses a fresh browser process on loopback port **4178**. The report distinguishes weak-reference observations, native retention and the incomplete macOS WebKit process-memory scope. `bun run memory:native investigation 100` reproduces the native retention with plain HTML tables and a div control, without loading Mosaic. Replacement results are saved under `benchmark-results/memory-investigation/`, and the native-only probe uses `benchmark-results/memory-native-investigation/`. Use a new label for each run.

Before hosting, review the [deployment gates](docs/release-readiness.md#remaining-limitations-and-deployment-gates). The production viewer uses a precompiled validator and is tested under a CSP that excludes `unsafe-eval` and inline scripts. The tested policy permits inline styles for existing theme/layout behavior; it is documented in the release record. Initial assets require HTTP(S); offline cold startup and `file://` are unsupported. No deployment or CSP change is performed by this repository's release review.

## Contract and source layout

```text
docs/
  user-guide.md               Opening, editing, saving, offline use and limitations
  troubleshooting.md          Setup, file errors, drafts and download recovery
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
  generate-validator.ts        Build-time Ajv compilation and standalone ESM bundling
  validator-options.ts         Shared strict, non-mutating compiler settings
  schema-validator.ts          Schema conformance helper for tests
  validate-example.ts          Reference-document validation command
src/
  core/types.ts                Portable types for all 14 node kinds
  core/file.ts                 Local File/Blob reading and byte guard
  core/preflight.ts            Iterative node limits and object cycle checks
  core/schema.ts               Guarded, precompiled Draft 2020-12 schema check
  core/schema-validator.generated.js  Ignored build output with a typed declaration
  core/validate.ts             Full in-memory validation API
  core/semantics.ts            Dataset, state, node, and chart rules
  core/parse.ts                Parse and validate text into a typed document
  core/serialize.ts            Validate and produce formatted .mosa text
  core/store.ts                Indexed dataset reads and immutable cell and state edits
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
  render/TableView.tsx         Captioned dataset tables with progressive row rendering
  render/CellEditor.tsx        Typed cell controls, local drafts, and inline error feedback
  render/StateControls.tsx     Bound text/number inputs and boolean toggles
  render/useValueDraft.ts      Shared local drafts and complete finite-number parsing
  render/ChartView.tsx         Responsive SVG bar and line charts with text summaries
  render/chart-geometry.ts     Finite scales, bounded ticks, and ordered point selection
  render/markdown-policy.ts    Link destinations and document fragment targets
  app/App.tsx                  Demo, file picker, drop handling, and validated replacement
  app/DocumentView.tsx         Preview and formatted Source tabs
  app/download.ts             Validated current-snapshot export and local Blob download
  app/ErrorPanel.tsx           Import/export diagnostics and JSON Pointers
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
  state-controls.test.tsx     Reactive state controls, numeric drafts, and shared bindings
  file-workflow.test.tsx      File opening, replacement, recovery, and view switching
  download.test.tsx           Export bytes, resource cleanup, limits, and failure recovery
  store-dirty.test.ts         Dirty transitions, download checkpoints, and unchanged snapshots
  unsaved-changes.test.tsx    Replacement confirmation, cancellation, and pending-file races
  schema.test.ts              Structural contract and regression tests
  errors.test.ts              Diagnostic/result contract tests
  json-pointer.test.ts        Escaping and path-construction tests
  limits.test.ts              Budget, boundary, and schema-agreement tests
```

The working schema differs from the supplied original only by the approved prohibition on a declared column key named `id` (D003). Row `id` remains required metadata. A test guards that precise amendment; the original files remain available for review.

Use `parseMosaic(text)` for JSON text or `validateMosaic(value)` for an in-memory value, including the successful file reader’s `value`. Both return `{ ok: true, document: MosaicDocument }` after preflight, schema, and semantic validation. Failure returns `{ ok: false, errors }` with a code, JSON Pointer, and message for the first violation.

Use `serializeMosaic(document)` to export the current model as two-space JSON with one final LF. It revalidates the document and enforces the inclusive 5 MiB limit on the formatted UTF-8 output. A failed export throws `MosaicSerializationError` with the same `errors` list used by validation. See the [serialization contract](docs/core-contracts.md#serializing-a-document) for boundary behavior.

The Ajv configuration uses Draft 2020-12, strict checks, finite numbers, own-property lookups, and no coercion, default insertion, or property removal. Scalar union types are enabled because the supplied schema uses them. Compilation happens in `scripts/generate-validator.ts`, using the trusted repository schema. Ajv is a development dependency; the shipped module contains static validator functions and the bundled Unicode-length helper, with no runtime compiler or imports.

`bun run dev`, `typecheck`, `test`, `test:watch` and `validate:example` regenerate the ignored module first. Build, browser tests, benchmarks and profiling reach generation through those commands. Generation failures stop the command; there is no runtime compilation fallback. The typed declaration is tracked, while generated JavaScript is excluded from Git, lint and formatting. After editing the schema or compiler settings in an already-running dev/watch session, run `bun run generate:validator` or restart that session. Use the package scripts on a fresh checkout; direct tool invocations must generate the module first.

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

`store.updateState('note', 'Updated report')` updates an existing state key and returns the same success/error result shape as `updateCell`. A successful change copies the state map and document and notifies subscribers once. Equal values reuse the current snapshot. Errors use `INVALID_BINDING` and the affected state key's JSON Pointer, such as `/state/note`.

The store indexes control binding types when it opens the validated document, including hidden controls. Toggle bindings require booleans, text inputs require strings, and number inputs require finite numbers. Keys used only by `when` or `stateValue`, along with unbound keys, can change among strings, finite numbers, booleans, and null. Rejected edits preserve the current snapshot. State updates also compose with cell edits and survive serialization and reopening.

`store.isDirty()` returns a boolean that starts false and becomes true before subscribers are notified of a changed edit. After a download starts, `store.markDownloaded(snapshot)` clears it only if the exported snapshot is still current. Passing an older or foreign snapshot leaves newer edits dirty. Clearing the flag notifies subscribers without copying or changing the document; unchanged checkpoints are silent. This constant-size bookkeeping is outside the `.mosa` model and is never serialized.

### Preview

Pass the successful result of `parseMosaic` or `validateMosaic` to the React preview as `<NodeRenderer document={result.document} />`. The renderer starts at `document.root`. Each child keeps its array position and uses its node ID as its React key.

Columns stack children, rows wrap, and grids use the declared column count when space permits. Each grid measures its own available width. It sheds columns as tracks approach 14 rem and can shrink a single track to the width of a narrow card. An explicit gap token from 0 through 6 sets the gap in steps of 0.25 rem. Cards group ordered children under an optional title. Headings use the declared level, text preserves line breaks, and dividers render a horizontal rule.

Opening a validated document applies its `theme` to the viewer. Mode defaults to `system` and follows live changes to the device color scheme. A document can also select `light` or `dark`. The accent is `blue` by default, with `teal` and `amber` alternatives for controls, links, and focus indicators. The default `comfortable` density uses a 0.75 rem layout gap. The `compact` density uses a 0.5 rem default gap and tighter card and panel padding. Explicit node gaps take precedence.

Markdown uses CommonMark for paragraphs, emphasis, lists, quotations, code, and links. The renderer skips raw HTML and drops images before React creates DOM elements. Markup inside a code span or fence displays literally. These rules affect the preview only. The Markdown source stays in the document for serialization.

Code blocks are named keyboard-focusable scroll regions. Links with no remaining text, including image-only links, create no unnamed tab stop. If a state edit hides its own focused control through `when`, focus returns to Preview so keyboard navigation can continue through the remaining content.

Markdown syntax deeper than the viewer's 128-level AST budget, or another Markdown rendering failure, shows an explanatory note and escaped source text in that node. The rest of the document remains usable. This rendering safeguard leaves format validation and exported values unchanged; see the [audit report](docs/security-audit.md) for counting and scope.

HTTP and HTTPS links open in a new tab with `noopener noreferrer`. Mail links use the user's mail handler. A fragment such as `#notes` targets the rendered element for the Mosaic node with ID `notes`. DOM targets have a viewer-owned prefix to avoid collisions with the app shell. Other destinations, including relative paths and protocol-relative URLs, display their link label as ordinary content.

The preview uses the current `state` map. A `when` renders its children in order only if the bound value equals `equals` in both type and value. A `stateValue` displays its optional prefix, the current value, and its optional suffix. It displays `null` as an em dash and preserves empty strings, zero, and false.

Inputs and toggles start with saved values and immediately commit valid changes through `updateState`. Text inputs use multiline fields, preserving line breaks and empty strings. Toggles use native checkboxes and commit booleans. An empty or whitespace-only control label falls back to its binding key. Each successful change updates all controls and `stateValue` nodes bound to that key, reevaluates `when`, and appears in Source.

Number inputs share the cell editor's complete finite-decimal parsing, including signs, fractions, and exponents. Drafts such as an empty field, `-`, `1e`, or an overflowing number stay in the control with associated inline feedback; the last valid number remains in the document. Valid spelling stays visible while typing and normalizes on blur. Escape restores the latest committed value. Unrelated state or cell edits preserve a draft; a changed value from the same binding replaces it. Controls bind to strings, numbers, or booleans, so they do not offer a null option. Leaving Preview or hiding a conditional region discards its local drafts; committed edits remain in the store.

Tables use the dataset name as a visible caption and each column's label as its header. A blank label falls back to its column key. Rows and columns appear in file order. Strings display literally, including line breaks and empty strings. Numbers display without rounding or grouping, booleans display as `true` and `false`, and a null cell shows an em dash with the accessible name “No value”.

Tables with up to 100 rows display in full. Larger tables start with 100 rows and show how many are visible. **Show more** appends up to 100 rows at a time and moves keyboard focus to the first new row. Each table expands independently. Wide tables scroll horizontally inside the preview.

The viewer enables a cell control when both its table and column specify `editable: true`. Valid edits immediately update the store, every table and chart using that dataset, and Source. Each control's accessible label includes its column label and stable row ID.

String cells use a multiline text field and preserve empty strings. Boolean cells offer `true`, `false`, and **No value**. Number cells accept complete finite decimal notation, including signs, fractions, and exponents. Text and number cells also offer **No value** to store `null`. An empty numeric field remains a draft until the user enters a number or chooses **No value**.

Invalid drafts stay visible with an associated inline error and preserve the latest committed document value. This also applies when the store rejects an edit that would exceed a chart's point limit. Escape restores the latest committed value. Numeric spelling is preserved during typing and normalized on blur after successful validation. An edit to the same cell through another table replaces its previous draft with the newly committed value.

The viewer supplies `NodeRenderer` with `onCellEdit={store.updateCell}` and `onStateEdit={store.updateState}`. A standalone renderer can enable either set of controls by supplying its callback along with a subscribed document snapshot. Without those callbacks, tables remain read-only and state controls remain disabled.

Charts render as SVG and measure their container to keep labels readable as the layout resizes. The visible caption uses the chart title, falling back to the dataset name when the title is blank. A visible text summary supplies the chart kind, axis labels, plotted point count, exact y-value range, and skipped-row count. The SVG references that caption and summary for its accessible name and description.

Bars occupy equally spaced categories in file order, including numeric x labels, with a zero baseline for positive and negative values. Lines use proportional spacing for numeric x values and equally spaced positions for string x values. Line segments connect points in file order, including when numeric x values run backward. Each plotted line point has a visible marker, so a single point remains visible. Line y scales cover the data range and expand for constant series.

Both chart kinds skip any row with null x or y. Empty strings and zero remain valid points. An empty or entirely skipped dataset displays an explanatory message. Axis labels are capped at five x ticks and six y ticks, including zero when it is in range. Long string labels are abbreviated to fit, while the document retains their complete values. Chart colors follow the document theme, and committed store edits refresh both geometry and summaries.

Run `bun run test tests/rendering.test.tsx tests/markdown.test.tsx tests/initial-state.test.tsx tests/table.test.tsx tests/charts.test.tsx tests/cell-editing.test.tsx tests/state-controls.test.tsx` to exercise rendering, table interactions, cell and state editing, and chart geometry.

## Phase boundaries

1. **Phase 0:** environment, schema/types, automated schema checks, documentation, and build.
2. **Phase 1:** bounded parser, full validation, serialization, and format-rule tests.
3. **Phase 2:** read-only viewer, secure local import, safe Markdown, and initial-state rendering.
4. **Phase 3:** datasets, accessible tables, editable cells, and minimal SVG charts.
5. **Phase 4:** state mutations, download persistence, and unsaved-change handling.
6. **Phase 5:** hardening, browser/accessibility checks, and measured production benchmarks.

Cloud services, AI API integration, executable document code, assets, formulas, and other later-version features are outside v0.1. A static build needs a suitable HTTP host; opening `index.html` through `file://` is not a supported deployment method.
