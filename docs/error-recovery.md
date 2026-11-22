# Phase 5 — Viewer error recovery verification

**Historical verification record:** Names, measurements and counts below describe the builds recorded at the time. The current rc.3 format uses the `glyf` marker, `.glyf` files and Glyf APIs; see [the current contract](compatibility.md#glyf-name-and-file-extension). These results are not new rc.3 measurements.

Verified on **2026-11-18** with Node **22.18.0**, the production Vite build, and Playwright's **Chromium 159.0.8154.6** and **WebKit 27.2**.

The existing viewer preserved the current document throughout the new scenarios. No application defect was found in this verification, so this step adds tests and evidence without changing runtime behavior, the schema, dependencies, or resource limits.

## Real files through both viewer entry routes

[error-recovery.spec.ts](../tests/browser/error-recovery.spec.ts) exercises the **Open File** button and its file chooser, plus the app's drop handler with a browser `DataTransfer` containing a real `File`. Bytes are passed unchanged, including invalid UTF-8. The tests use the real file reader, parser, resource preflight, schema, semantic validation, document store, error panel, and downloader. These paths are not mocked.

Each scenario first loads the app assets, disables networking, opens the bundled demo, and commits these edits:

- The note becomes multiline Unicode text: `Keep 雪 😀` followed by `Second line`.
- January revenue becomes **5000**.
- **Show revenue chart** becomes false, hiding the conditional chart.

The test runs in both **Preview** and **Source** for each import route and browser: **eight edited-document scenarios**. Preview also retains the invalid numeric draft `1e`, whose committed value remains 5000.

Each scenario imports the following **16 rejected files** in succession. Together they exercise all ten structured format-error codes through the viewer.

| Rejected input                                         | Expected diagnostic                  |
| ------------------------------------------------------ | ------------------------------------ |
| Empty file                                             | `INVALID_JSON`, document root        |
| Truncated JSON object/value                            | `INVALID_JSON`, document root        |
| Trailing comma                                         | `INVALID_JSON`, document root        |
| Duplicate property with an escaped equivalent spelling | `INVALID_JSON`, `/state/a~1b~0`      |
| Truncated UTF-8 sequence following a BOM               | `INVALID_UTF8`, document root        |
| UTF-16LE JSON with its BOM                             | `INVALID_UTF8`, document root        |
| Two UTF-8 BOMs                                         | `INVALID_JSON`, document root        |
| Unsupported `0.2.0` version                            | `UNSUPPORTED_VERSION`, `/mosaic`     |
| Unknown document property                              | `SCHEMA_ERROR`, `/unexpected`        |
| Text node used as the document root                    | `INVALID_ROOT`, `/root/type`         |
| Repeated node ID in a nested card                      | `DUPLICATE_ID`, later node's ID      |
| String in a numeric dataset column                     | `INVALID_DATASET`, offending cell    |
| Missing state binding inside hidden content            | `INVALID_BINDING`, offending binding |
| 2,001 total nodes                                      | `RESOURCE_LIMIT`, `/root/children`   |
| 21 node levels                                         | `RESOURCE_LIMIT`, offending node     |
| 5,242,881 actual UTF-8 bytes                           | `FILE_TOO_LARGE`, document root      |

For every rejection, the tests verify:

- The file error panel receives focus and shows the expected filename, code, JSON Pointer, and the public reader/validator's exact message. The empty pointer is explicitly labeled as the document root.
- The selected view and its existing DOM panel remain intact. Source matches the independently constructed expected edited document exactly. Preview retains the same cell control, invalid draft, note, bound note display, toggle value, and hidden chart.
- The current filename, theme attributes, and unsaved indicator remain unchanged.
- Loading has finished, Download is enabled, and no discard confirmation was requested for the invalid candidate.

After the failures, each scenario checks the error and retained document at **320 CSS pixels**, saves a screenshot, and downloads the still-open demo. All eight exports contain **2,558 UTF-8 bytes**, exactly matching the expected two-space JSON plus final LF. The exported document passes full validation and contains the committed edits; the invalid draft is excluded. Download clears the file error and dirty status while leaving a Preview draft local to its control.

The scenario then retries a corrected file using the **same filename as the last failed import** and the same route. The new document opens cleanly with focus on Preview. A subsequent Open Demo restores the original note, table value, toggle, and visible chart. This confirms that rejection did not leave the file workflow stuck.

## Exact byte boundary

Four additional browser cases cover both import routes in both engines. A clean demo remains open after rejecting **5,242,881 bytes**, without becoming dirty. Retrying the same filename with **5,242,880 bytes** succeeds and clears the error.

These files include one UTF-8 BOM and multibyte text. Trailing JSON whitespace fills the remaining bytes, so the boundary is measured from real file contents without creating a huge rendered field. The accepted file's Source is checked against the expected document. The generated multi-megabyte fixtures are not committed to the repository.

## Asynchronous read failures and stale requests

[error-recovery.test.tsx](../tests/error-recovery.test.tsx) adds **six component tests** for timing and operating-system read failures that cannot be reproduced reliably using ordinary valid browser files:

- A pending read fails through either picker or drop. Edits made during the read, existing control identity, chart geometry, the invalid draft, and dirty status survive. Download is disabled only while loading and becomes available after failure. The viewer displays its retry message without exposing internal exception details or misclassifying I/O as invalid JSON. Escape restores the last committed cell value, and a corrected same-name file can subsequently open.
- An older read finishes with valid data, malformed data, or an I/O rejection after a newer oversized import has failed. All three stale outcomes leave the newer error, its focus, current Source, edits, and dirty status intact. The oversized file is rejected before its `arrayBuffer()` method is called.
- A clean document with only an invalid local draft stays clean after a failed import; the draft and original committed value remain available.

These tests control only the pending file's `arrayBuffer()` result and the native confirmation response. The application and its validation pipeline run normally. Browser tests separately exercise the real bytes and download behavior.

## Results and reproduction

- `npm run check` passed **572 unit/integration tests across 24 files**, strict TypeScript, ESLint, formatting, reference-demo validation, and the production build. Six cases were added in this step.
- `./node_modules/.bin/playwright test tests/browser/error-recovery.spec.ts` passed all **12 new browser cases**. The eight edited-document scenarios each exercised all 16 failures; the other four tested the inclusive byte boundary.
- All new browser cases require **zero non-Blob request attempts, zero uncaught page errors, and zero unexpected dialogs** after networking is disabled. Offline operation is checked after app assets have loaded.
- Reviewed mobile screenshots show the error above the retained Preview/Source without page-width overflow. Tables and Source retain their existing internal horizontal scrolling.
- Production JavaScript remains **512.68 kB minified / 155.60 kB gzip**. The existing Vite chunk-size warning remains; this step introduces no runtime code or performance claim.

Run the component tests:

```sh
bun run test tests/error-recovery.test.tsx
```

Build and run the focused browser suite:

```sh
bun run test:viewer tests/browser/error-recovery.spec.ts
```

Each edited-document browser scenario writes `preserved-error-320.png`, `preserved-edits.mosa`, and `recovery-results.json` beneath its ignored `test-results/` directory. The JSON records browser version, route, view, each rejected file's size and diagnostic, export size, and request/error/dialog observations. A later Playwright run may replace these generated artifacts; rerun the focused suite to recreate them.

Other format ceilings continue to be covered by the existing core suites and [security audit](security-audit.md). Broader accessibility checks and production timing/memory benchmarks remain separate Phase 5 work.
