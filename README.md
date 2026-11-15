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

If you use nvm, run `nvm install` and `nvm use` first. Open the localhost URL printed by Vite (normally `http://127.0.0.1:5173`). The initial screen is a foundation placeholder, not the document viewer. Use Ctrl+C to stop the server.

`npm ci` installs the committed lockfile exactly. `npm install` also works for initial setup or intentional dependency changes. Direct dependency versions are exact; do not update them automatically.

## Commands

| Command                    | Purpose                                                                   |
| -------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`              | Start Vite on the loopback interface.                                     |
| `npm run typecheck`        | Check strict TypeScript across source, scripts, tests, and configuration. |
| `npm run lint`             | Run ESLint with zero warnings allowed.                                    |
| `npm run test`             | Run schema and core contract tests once.                                  |
| `npm run test:watch`       | Watch tests during development.                                           |
| `npm run validate:example` | Run full v0.1 validation on the reference file.                           |
| `npm run format:check`     | Check formatting without editing files.                                   |
| `npm run format`           | Apply formatting; preserve supplied reference files.                      |
| `npm run build`            | Typecheck and create the static production build in `dist/`.              |
| `npm run preview`          | Serve the production build locally.                                       |
| `npm run check`            | Run all implemented checks and the production build.                      |

Benchmark tooling is scheduled for Phase 5. Browser/component test dependencies will be added when those implementations begin; Phase 0 uses Vitest in Node without a DOM emulator.

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
  core/utf8.ts                 Shared UTF-8 text size and encoding checks
  core/source.ts               Byte and text decoding, syntax, and version checks
  core/json-source.ts          Duplicate JSON property scanning
  core/errors.ts               Structured diagnostics and parser result types
  core/json-pointer.ts         Typed diagnostic-path construction and syntax checks
  core/limits.ts               Fixed budgets and shared limit diagnostics
  render/NodeRenderer.tsx      Preview a validated document starting at its root
  render/nodeRegistry.tsx      Typed components for the 14 v0.1 node kinds
  app/App.tsx                  Minimal foundation screen
  main.tsx                    React entry point
  styles/global.css           Local stylesheet and system fonts
tests/
  fixtures.ts                 Typed fixtures covering every node kind
  format.test.ts              File diagnostics, immutability, and boundary round trips
  preflight.test.ts           Node limits, graph cycles and validation ordering
  semantics.test.ts           Cross-field validation and aggregate limits
  parser.test.ts              File, byte, and text parsing tests
  serialize.test.ts           Export formatting, round-trips, and final byte limits
  rendering.test.tsx          Component dispatch, markup nesting, and child order
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

Pass the successful result of `parseMosaic` or `validateMosaic` to the React preview as `<NodeRenderer document={result.document} />`. The renderer starts at `document.root`. Each child keeps its array position and uses its node ID as its React key.

The registry displays headings and text, uses the initial document state for conditional content and disabled controls, and labels chart and table placeholders. Markdown currently displays as escaped source text. Run `npm test -- tests/rendering.test.tsx` to exercise the renderer independently of the app shell.

## Phase boundaries

1. **Phase 0:** environment, schema/types, automated schema checks, documentation, and build.
2. **Phase 1:** bounded parser, full validation, serialization, and format-rule tests.
3. **Phase 2:** read-only viewer, secure local import, safe Markdown, and initial-state rendering.
4. **Phase 3:** datasets, accessible tables, editable cells, and minimal SVG charts.
5. **Phase 4:** state mutations, download persistence, and unsaved-change handling.
6. **Phase 5:** hardening, browser/accessibility checks, and measured production benchmarks.

Cloud services, AI API integration, executable document code, assets, formulas, and other later-version features are outside v0.1. A static build needs a suitable HTTP host; opening `index.html` through `file://` is not a supported deployment method.
