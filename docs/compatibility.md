# Mosaic v0.1 compatibility contract

This describes the implemented **`0.1.0`** format and viewer. It summarizes [SPEC_V0.1.md](SPEC_V0.1.md), [the approved decisions](decisions.md), and [the core API contracts](core-contracts.md); it does not introduce new format rules.

## Contract sources and version handling

The authoritative structural contract is [schema/mosaic-v0.1.schema.json](../schema/mosaic-v0.1.schema.json), JSON Schema Draft 2020-12. The working schema contains the approved D003 amendment forbidding `id` as a declared column key. The supplied original schema/specification remain unchanged under `docs/reference/`. The reference document is [examples/mosaic-demo.mosa](../examples/mosaic-demo.mosa), preserved as supplied. Tests check the schema amendment, schema/resource-constant agreement, the demo, and all 14 typed node kinds.

Files contain one UTF-8 JSON object with the exact string **`"mosaic": "0.1.0"`**. A different string version yields `UNSUPPORTED_VERSION`; a missing/non-string version is a structural error. There is no version guessing, automatic migration, extension namespace, unknown-field preservation, or acceptance promise for future versions. Unknown fields and node types are rejected. A future migration must be explicit; the current reader cannot interpret a future document merely because its version begins with `0.1`.

An optional single leading UTF-8 BOM is accepted; malformed UTF-8, a misplaced/repeated BOM, duplicate JSON properties (including escaped-equivalent names), non-finite numbers, and malformed JSON are rejected. Loading does not coerce cell/state types, add optional defaults, or discard unknown properties to make a document pass.

Schema conformance alone is insufficient. A conforming reader also enforces source-level rules, resource preflight and semantic checks before rendering. `parseMosaic(text)` performs full validation; `readMosaicFile(blob)` returns a source value that still needs `validateMosaic(value)`. The in-memory API expects data from a trusted JavaScript caller and cannot sandbox Proxy traps or arbitrary executable objects.

## Supported vocabulary and semantics

| Group         | Supported node types                     |
| ------------- | ---------------------------------------- |
| Layout        | `column`, `row`, `grid`, `card`          |
| Content       | `heading`, `text`, `divider`, `markdown` |
| Data          | `table`, `chart`                         |
| State/control | `when`, `input`, `toggle`, `stateValue`  |

The root must be a layout node. Node IDs are globally unique; children retain file order. Headings use the requested `h1`–`h4` level. Responsive layout may reduce grid columns or wrap rows; pixel-identical layout is not a format guarantee. Theme tokens are a closed set rather than arbitrary CSS. Missing optional fields keep their absence in saved data; viewer defaults do not rewrite them.

Dataset names resolve within the document. Columns have unique keys with kind `string`, `number`, or `boolean`; `id` is row identity, never a column. Each row contains exactly its stable `id` and every declared cell; missing values use explicit `null`. Row IDs are unique within a dataset. Non-null cells match their declared type. `__proto__`, `constructor`, and `prototype` are reserved dataset/state/column names and corresponding references. The validator also resolves references and checks chart/state binding compatibility.

Editing requires both table and column `editable: true`. Updates replace existing values immutably and preserve row/file order. Invalid changes retain the last valid value. Row creation/deletion, sorting, filtering, formulas, dataset reshaping and schema editing are outside this viewer's v0.1 editing surface.

State is a flat scalar map. Toggles require existing boolean keys; text/number inputs require existing string/finite-number keys. `when` uses strict equality with its scalar `equals` value. `stateValue` displays the current scalar as text and uses an em dash for null. Invalid numeric drafts remain local UI text and are not exported. There is no expression evaluator or action scripting.

Charts support only `bar` and `line`, with string/number x columns and number y columns. They preserve row order and skip rows whose selected x or y is null; zero and empty string are values. Negative values are supported. Bars use equally spaced categories and a zero baseline. Lines use proportional numeric x positions or equally spaced string x positions. Captions and text summaries accompany the generated SVG.

Markdown is CommonMark text with raw HTML and images disabled. There is no GFM extension promise. Allowed link targets are validated absolute HTTP(S), `mailto:`, and valid local node-ID fragments; relative/network-path and other schemes are rejected. Local fragments are namespaced to avoid viewer-ID collisions. External navigation occurs only when the user activates a link. Code blocks are inert text. A separate 128-edge Markdown AST rendering budget can produce a readable source fallback without making the document invalid or changing its exported text.

## Fixed resource limits

All limits are inclusive; one over is rejected. See [counting details](core-contracts.md#resource-ceilings-and-counting-rules) for the precise rules.

| Resource                                         |                   Limit |
| ------------------------------------------------ | ----------------------: |
| Input bytes and final formatted export bytes     | 5 MiB / 5,242,880 bytes |
| Nodes, including root and hidden descendants     |                   2,000 |
| Node-tree depth, root at 1                       |                      20 |
| Datasets                                         |                      20 |
| Columns per dataset                              |                      30 |
| Rows per dataset                                 |                   1,000 |
| Total cells, nulls included and row IDs excluded |                  20,000 |
| Non-null plotted points per chart                |                     500 |
| Unicode code points per Markdown string          |                  20,000 |
| State keys                                       |                     100 |

Additional schema string/identifier constraints still apply. Hidden content is fully validated and counted. Resource counts cannot be changed by document content.

## Export and diagnostics

Export validates the current committed document, writes **two-space JSON plus one final LF, UTF-8 without a BOM**, and measures final bytes before downloading. Array order, IDs, structure and saved values persist on re-import; exact source bytes, whitespace, number spelling and BOM are not preserved. Object property order is not semantic. JavaScript JSON number semantics apply: arbitrary-precision decimal fidelity is not promised, and `-0` serializes as `0`. Optional absent fields remain absent.

Compact valid input can exceed 5 MiB after indentation or edits. In that case export fails with a clear error and retains the current document; it never truncates content, silently changes formatting or raises the cap. Download creates a new browser-managed file rather than overwriting the original. Starting a download marks its committed snapshot as saved, but cannot prove that the browser completed a disk save. There is no automatic save or reload/session recovery.

Errors contain a stable category, human-readable message and RFC 6901 JSON Pointer; an empty pointer identifies the document root. Codes are `FILE_TOO_LARGE`, `INVALID_UTF8`, `INVALID_JSON`, `UNSUPPORTED_VERSION`, `SCHEMA_ERROR`, `DUPLICATE_ID`, `INVALID_ROOT`, `INVALID_BINDING`, `INVALID_DATASET`, and `RESOURCE_LIMIT`. Message wording is not a machine compatibility key. Validation reports the first applicable failure; callers must not assume every error appears in one response. Browser file-read/download failures have separate retry feedback.

## Runtime and future-version boundary

The current implementation is a browser viewer served as static app assets over HTTP(S). Local document processing works offline after those assets load; cold offline startup, a service worker and `file://` deployment are not supplied. The trusted schema is precompiled during the build; the viewer executes static validation code and starts under the tested CSP without `unsafe-eval`. The policy still permits inline styles for the existing theme/layout. Chromium/WebKit workflow coverage and other deployment/browser/accessibility limits are recorded in [release-readiness.md](release-readiness.md).

No account, backend, remote data service, external font, AI key, or AI API is used for document processing. Compressed containers, assets/images, arbitrary HTML/CSS/JS, plugins, formulas, canvas/whiteboard tools, collaboration, cloud synchronization, richer imports/exports and migrations remain future work. No later-version feature was added for release reporting.
