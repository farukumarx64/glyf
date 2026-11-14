# Mosaic

Mosaic is a local-first visual document format and viewer. A `.mosa` document is UTF-8 JSON with a closed component vocabulary and exact format version `0.1.0`.

The **Phase 0 foundation** establishes the development environment, schema contract, portable TypeScript types, and automated schema checks. **Phase 1, step 1** adds the shared error/result contract, JSON Pointer helpers, resource ceilings, and limit diagnostics. File import, semantic validation, document rendering, editing, and export remain pending.

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
| `npm run validate:example` | Validate the reference demo against Draft 2020-12.                        |
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
scripts/
  schema-validator.ts          Shared schema-only tooling configuration
  validate-example.ts          Reference-document validation command
src/
  core/types.ts                Portable types for all 14 node kinds
  core/errors.ts               Structured diagnostics and parser result types
  core/json-pointer.ts         Typed diagnostic-path construction and syntax checks
  core/limits.ts               Fixed budgets and shared limit diagnostics
  app/App.tsx                  Minimal foundation screen
  main.tsx                    React entry point
  styles/global.css           Local stylesheet and system fonts
tests/
  fixtures.ts                 Typed fixtures covering every node kind
  schema.test.ts              Structural contract and regression tests
  errors.test.ts              Diagnostic/result contract tests
  json-pointer.test.ts        Escaping and path-construction tests
  limits.test.ts              Budget, boundary, and schema-agreement tests
```

The working schema differs from the supplied original only by the approved prohibition on a declared column key named `id` (D003). Row `id` remains required metadata. A test guards that precise amendment; the original files remain available for review.

Types describe the format but cannot prove identifier patterns, finite numbers, limits, or cross-reference correctness. `MosaicDocument.root` reflects the specification's layout-root restriction, which the future semantic validator must enforce. Typed fixtures and schema tests check the node vocabulary together.

**Schema validation alone does not establish full Mosaic validity.** The tooling validator is for the trusted local fixtures; it is not the public import API. Duplicate source keys, resource preflight, semantic rules, and safe serialization belong to Phase 1. It must not be connected directly to untrusted file import.

The Ajv configuration uses Draft 2020-12, strict checks, finite numbers, own-property lookups, and no coercion, default insertion, or property removal. Scalar union types are enabled because the supplied schema uses them. The schema compiles once per tooling module instance.

## Phase boundaries

1. **Phase 0:** environment, schema/types, automated schema checks, documentation, and build.
2. **Phase 1:** bounded parser, full validation, serialization, and format-rule tests.
3. **Phase 2:** read-only viewer, secure local import, safe Markdown, and initial-state rendering.
4. **Phase 3:** datasets, accessible tables, editable cells, and minimal SVG charts.
5. **Phase 4:** state mutations, download persistence, and unsaved-change handling.
6. **Phase 5:** hardening, browser/accessibility checks, and measured production benchmarks.

Cloud services, AI API integration, executable document code, assets, formulas, and other later-version features are outside v0.1. A static build needs a suitable HTTP host; opening `index.html` through `file://` is not a supported deployment method.
