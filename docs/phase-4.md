# Phase 4 — Complete workflow verification

Verified on **2026-11-18**, using the production Vite build, Node **22.18.0**, and Playwright's **Chromium 159.0.8154.6** and **WebKit 27.2**.

## What the new end-to-end tests prove

[complete-workflow.spec.ts](../tests/browser/complete-workflow.spec.ts) runs two scenarios in each browser. Each starts with two independent viewer pages, loads their app assets, and then disables networking for their shared browser context. The receiving page has no open document when it imports the first download. Edits are made through the rendered controls, and real browser downloads are saved to disk and reopened through the file chooser. No document store, serializer, file read, or download is mocked.

### Reference demo: hidden and visible conditional content

1. Open the bundled demo offline. Set January revenue to **-125.5**, February to **null**, and March to **0**. Verify the chart's two remaining points, exact value range, and skipped-row summary.
2. Set the note to multiline Unicode text containing literal HTML-like text. Verify the bound display updates, then switch **Show revenue chart** off.
3. Leave an invalid numeric draft in January's input and download. The file retains **-125.5**; the invalid draft remains local in the original viewer.
4. Open the downloaded file in the empty second viewer. Verify all cell values, the note and its display, the unchecked toggle, absent chart, clean unsaved-change status, and absence of stale draft errors.
5. Turn the chart back on in the second viewer. Verify it renders the edited dataset, while the first viewer stays unchanged. Download again and reopen that file in the first viewer. Verify that the visible chart state and values persist.

The complete exported document is compared with an independently constructed expected document, including IDs, node and row order, metadata, theme, and hidden chart definitions. The reference demo on disk remains unchanged.

### Typed cells and numeric state

The second scenario uses an existing-vocabulary test document with editable string, number, and boolean columns, a text input, a numeric state input, `stateValue`, and a numeric `when` condition.

- Empty string and multiline Unicode string cells persist literally.
- A finite decimal number, boolean `false`, and null number/boolean cells retain their types and values.
- An empty text-state value remains an empty string.
- Numeric state **0** persists, appears as **Count: 0**, and restores the conditional **Zero count** text.
- An unfinished numeric-state draft, `1e-`, is excluded from the file. The new viewer opens with **0** and no input error.
- The reopened viewer is checked at **320 CSS pixels** for page overflow.

## File and offline assertions

Every export must match the expected two-space JSON plus one final LF, byte for byte in UTF-8, and fit the 5 MiB limit. The downloaded bytes also pass the strict file reader, resource preflight, schema validation, and semantic validation. The reopened Source view must match the same expected serialization.

Both pages must remain offline through the end of each scenario. The tests record all non-Blob request attempts, including requests that would fail offline, and require **zero**. Local Blob download URLs are excluded from this network count. They also require zero uncaught page errors and zero unexpected confirmation dialogs. Download and reopen must leave the current document clean; a subsequent toggle edit must mark it unsaved again.

## Evidence and reproduction

The focused suite passed **4 browser cases**: two scenarios in each engine. Both engines produced identical export sizes:

| Export               | UTF-8 bytes |
| -------------------- | ----------: |
| `hidden-chart.mosa`  |       2,565 |
| `visible-chart.mosa` |       2,564 |
| `typed-values.mosa`  |       1,973 |

The full verification also passed: **544 unit/integration tests** across 21 files and **34 browser tests**, including the existing viewer, download, and unsaved-replacement suites. `npm run check` passed typechecking, ESLint, formatting, reference-demo validation, and the production build. The existing Vite chunk warning remains: JavaScript is **511.99 kB minified / 155.33 kB gzip**. These are build-reported bundle sizes, not runtime performance measurements.

Each test writes its real `.mosa` downloads, a screenshot of the reopened viewer, and `workflow-result.json` under its directory in `test-results/`. The JSON records the browser version, both pages' offline state, request attempts, uncaught errors, unexpected dialogs, export sizes, and suggested download names. These generated artifacts are ignored by Git and are recreated by a test run.

Run only these scenarios, including a fresh production build:

```sh
bun run test:viewer tests/browser/complete-workflow.spec.ts
```

Run all project checks and all browser tests:

```sh
bun run check
./node_modules/.bin/playwright test
```

## Scope

This verifies offline document processing **after app assets load**. It does not establish offline cold startup, service-worker caching, installation, or `file://` deployment support. No application feature, schema rule, runtime dependency, or format version was changed for this verification step. The browser controls a user's final disk-save destination; these automated tests explicitly save the browser download and inspect the resulting file.
