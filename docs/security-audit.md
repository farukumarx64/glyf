# Phase 5 — Security and robustness audit

Verified on **2026-11-18** with Node **22.18.0** and production builds in Playwright's **Chromium 159.0.8154.6** and **WebKit 27.2**. This covers the existing v0.1 import, validation, rendering, editing, and export paths. It is a code and regression-test audit, not a certification or an exhaustive proof against every possible input.

## Finding and fix: deeply nested Markdown

A valid Markdown string can contain thousands of nested block quotes or emphasis elements while staying within the **20,000 Unicode code-point** limit. That syntax nesting is independent of Mosaic's **20-node-level** tree limit. Before the fix, both new component regressions failed with a call-stack overflow in the Markdown dependency pipeline. Chromium also overflowed; WebKit instead created thousands of nested DOM elements. Relying on an engine's stack limit would produce inconsistent behavior.

The viewer now has two safeguards:

1. [markdown-depth.ts](../src/render/markdown-depth.ts) checks the parsed Markdown tree iteratively, before the recursive Markdown-to-HTML stages. Its rendering budget is **128 child edges from the Markdown AST root**, which is depth 0. Text leaves count. This leaves headroom for recursive library traversals without relying on browser-specific stack sizes.
2. A local React error boundary in [MarkdownView.tsx](../src/render/MarkdownView.tsx) catches this budget failure or another rendering exception. Only the affected Markdown node switches to a short explanatory note and its original source in an escaped, wrapping `pre` element. Other nodes and app controls remain available. A changed Markdown string gets a fresh rendering attempt.

This is a **viewer rendering budget**, not an eleventh format rejection rule. The document still passes validation, the ten format ceilings stay unchanged, and Download preserves the exact Markdown value. The fallback does not interpret HTML, create image elements, or activate source links. No package, schema field, error code, or later-version feature was added.

The new tests exercise exactly 128 AST levels, one over, and block-quote/emphasis strings at exactly 20,000 characters. They check readable fallback, sibling rendering, input immutability, recovery for a replacement with the same node ID, mobile width, state editing, real Download and reparsing, and subsequent Open Demo.

## Coverage reviewed and extended

| Area                    | Existing coverage retained                                                                                                                                                                                                                     | Added in this audit                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malicious Markdown      | Raw HTML and images omitted, allowed link schemes and node fragments, literal code, reference links and autolinks, safe external-link attributes.                                                                                              | Entity/control-character scheme obfuscation, `vbscript:` and Blob links; real-browser scripts, event handlers, SVG, MathML, iframes/srcdoc, objects, embeds, media, stylesheet imports, preload, base/meta tags, forms, and linked images. Verify no executable/fetching DOM, execution marker, non-Blob request attempt, or uncaught page error. Safe links and node anchors still work. |
| Reserved names          | All reserved declarations and references, own-property lookups, null-prototype records, unique IDs and complete typed rows.                                                                                                                    | Escaped spellings of `__proto__`, `prototype`, and `constructor` across 11 declaration/reference positions each; nested pollution payloads; unchanged `Object.prototype`; legal `toString`, `valueOf`, `hasOwnProperty`, and `toJSON` names through edit and export. `constructor`/`prototype` remain legal in the separate row/node ID scopes.                                           |
| Hostile JSON and errors | Malformed syntax, strict UTF-8, BOM placement, overflowing numbers, decoded duplicate names with escaped JSON Pointers, bounded scanner nesting, cycles, accessors, sparse/decorated arrays, symbols, non-JSON values and serialization hooks. | Source-file pollution payloads and browser errors with malicious filename/property text. Malformed UTF-8, escaped duplicate names, an unknown field and a reserved state key retain focused diagnostics and the current edited document. No discard prompt occurs for an invalid candidate.                                                                                               |
| Resource limits         | All ten inclusive ceilings and one over, hidden nodes, aggregate cells, skipped chart nulls, final export bytes, and a round trip at all ten ceilings together.                                                                                | The Markdown syntax-depth gap above; explicit dirty/snapshot/export/subscriber invariants after a chart-point overflow following successful edits.                                                                                                                                                                                                                                        |
| Failed edits            | Table/column permission checks, stable row IDs, exact scalar types, finite numbers, hidden control bindings, every affected chart, invalid UI drafts and Escape recovery.                                                                      | Hostile object values with throwing coercion/serialization hooks, reserved lookup attempts, `NaN`, infinities, undefined, arrays and bigint values. Rejection invokes no hooks, notifies no subscribers, and preserves snapshot identity, serialized content, and both clean and dirty states.                                                                                            |

The reviewed format ceilings remain: **5 MiB** of UTF-8 input/output; **2,000 nodes**; **20 tree levels**; **20 datasets**; **30 columns** and **1,000 rows** per dataset; **20,000 total cells**; **500 non-null points** per chart; **20,000 code points** per Markdown string; **100 state keys**. Counting conventions are unchanged and documented in [core-contracts.md](core-contracts.md).

New test sources are [security.test.ts](../tests/security.test.ts), [markdown-recovery.test.tsx](../tests/markdown-recovery.test.tsx), and [browser/security.spec.ts](../tests/browser/security.spec.ts), with reusable attack inputs in [security-fixtures.ts](../tests/security-fixtures.ts). Existing Markdown and store suites gained additional cases/assertions. Other reviewed suites include parser, preflight, semantics, serialization, format conformance, cell/state controls, downloads, and unsaved replacements.

## Verification results

- `npm run check`: **566 tests across 23 files**, strict TypeScript, ESLint, formatting, full reference-demo validation and production build passed. This is **22 additional unit/integration cases**, plus stronger assertions in an existing store test.
- `./node_modules/.bin/playwright test`: **42 passed**, including **8 new security cases** across Chromium and WebKit. The new security scenarios run offline after app assets load and require zero non-Blob request attempts and zero uncaught page errors.
- Production JavaScript: **512.68 kB minified / 155.60 kB gzip**, as reported by Vite. The pre-existing 500 kB chunk warning remains. These are bundle sizes, not performance benchmark results.

To reproduce all checks:

```sh
npm run check
./node_modules/.bin/playwright test
```

To run just the new/expanded security cases with a fresh production build:

```sh
npm test -- tests/security.test.ts tests/markdown-recovery.test.tsx tests/markdown.test.tsx tests/store.test.ts
npm run test:viewer -- tests/browser/security.spec.ts
```

## Boundaries and remaining Phase 5 work

- The Markdown parser still runs synchronously before the AST-depth check. The new guard prevents excessive recursive rendering and deep DOM construction; it is not a CPU deadline or a worker sandbox. Extreme delimiter sequences can still cost parsing time. Production timing, memory, repeated open/close measurements, and any resulting performance fixes belong to the remaining benchmark work.
- In-memory validation expects JSON data from a trusted JavaScript caller. Descriptor checks reject ordinary accessors without invoking them, but JavaScript reflection can execute Proxy traps. This API cannot sandbox arbitrary executable JavaScript objects or a compromised host realm. Untrusted file input goes through the byte/text parser and produces data-only JSON values.
- The new tests verify that rendering/importing causes no automatic document-controlled request. Intentionally clicking an allowed external link remains supported. Offline cold startup, service workers, and `file://` deployment remain outside v0.1.
- Dependency-advisory refresh, deployment CSP verification, broader accessibility review, and production benchmark/release reporting are not established by this audit. The dependency lockfile is unchanged; do not interpret passing attack tests as a current package-advisory clearance.

The security regression work is complete. The remaining Phase 5 acceptance work is still tracked in [SPEC_V0.1.md](SPEC_V0.1.md).
