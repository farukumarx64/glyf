# Mosaic v0.1 — Engineering decisions

## Status and scope

- **Accepted:** 2026-11-13, by the project owner in the design-review conversation.
- **Implementation status:** Phase 0 completed and verified on 2026-11-13. Phase 1 includes error and resource contracts, safe source parsing, resource preflight, full validation, and serialization.
- **Format version:** `0.1.0`.
- **Scope:** Clarify and harden the existing v0.1 contract without introducing later-version features.

The owner accepted all eight recommendations below. They are approved decisions, not unresolved proposals. Implementation must follow them alongside the supplied specification and schema. Where a decision amends the original specification or schema, the amendment is identified explicitly below.

Reference documents supplied for the review:

- `MOSAIC_V0.1_TECHNICAL_SPEC_AND_BUILD_PLAN.md`
- `mosaic-v0.1.schema.json`
- `mosaic-demo.mosa`

The supplied originals remain unchanged and are retained in `docs/reference/`; the demo is preserved in `examples/`. The owner subsequently authorized Phase 0, Phase 1 steps 1 through 5, and completion of automated format tests. The working schema and `docs/SPEC_V0.1.md` explicitly incorporate the approved contract amendments. Remaining implementation steps require a separate instruction.

## D001 — Reject duplicate JSON property names

**Decision:** Reject duplicate property names within every JSON object, including top-level objects, nodes, dataset maps, state maps, and rows.

`JSON.parse` retains the last occurrence of a duplicate property. Once parsing has completed, schema and semantic validation cannot recover that information. This can silently change document meaning and lead to different interpretations across implementations.

Implementation requirements:

- Scan the JSON source for duplicate property names before calling `JSON.parse`.
- Use a small, thoroughly tested token scanner; do not attempt duplicate detection with a regular expression.
- Compare decoded property names. For example, `"flag"` and `"fl\u0061g"` are the same name.
- Scope duplicate detection to each object. Reusing a property name in different objects is valid.
- Keep `JSON.parse` responsible for constructing the document.
- Return a structured error for duplicate properties rather than silently choosing a value.

The additional scan is linear in input length. Detection of duplicate node IDs, column keys, and row IDs remains a separate semantic responsibility.

**Contract effect:** Clarifies that the existing instruction to reject duplicate keys includes JSON object member names. Schema validation alone cannot enforce this source-level requirement.

**Implementation phase:** Phase 1.

**Verification:** Cover repeated names, escaped-equivalent names, nested objects, and legitimate reuse across distinct objects.

## D002 — Guard resources before schema validation

**Decision:** Use the following file-import order:

```text
Raw byte limit
  -> strict UTF-8 decoding
  -> duplicate-property check
  -> JSON.parse
  -> iterative resource preflight
  -> JSON Schema validation
  -> semantic validation
```

The public text parser must also enforce the specification's text-size safeguard. A small file can still contain excessive nesting, so the schema validator must not encounter an unchecked node tree before the depth limit is enforced.

Implementation requirements:

- Check node count and node-tree depth with an explicit stack before invoking the schema validator.
- Reject resource-limit violations with structured errors.
- Keep the schema authoritative for structural validity.
- Follow schema validation with the bounded semantic traversal for bindings, dataset rules, and other cross-field constraints.
- Reject cyclic objects passed directly to `validateMosaic(value)`, before they reach recursive schema validation. JSON files cannot express cycles, but JavaScript callers can supply them.

**Contract effect:** Explicitly amends the specification's schema-first ordering by adding a resource preflight. It does not remove schema validation or replace the semantic validator.

**Implementation phase:** Phase 1.

**Verification:** Exercise excessive depth and node counts, malformed structures, and cyclic in-memory input. Failures must remain structured rather than escaping as uncontrolled recursion errors.

## D003 — Reserve `id` for row identity

**Decision:** Forbid `id` as a declared dataset column key. A row's `id` is stable metadata, not an editable data cell.

Allowing a column named `id` would make one property serve both as row identity and as column data. Editing it could change the identifier used to locate the row.

Implementation requirements:

- Add an explicit prohibition to the schema's column-key definition.
- Update the specification to state that `id` is reserved for row metadata.
- Define a row's allowed properties as exactly `id` plus its declared column keys.
- Preserve the existing requirements for unique row IDs within each dataset and complete, correctly typed cells.

**Contract effect:** An approved tightening of the supplied schema and prose. Make both changes explicitly; do not introduce only an undocumented validator restriction. The reference demo is unaffected.

**Implementation phases:** Phase 0 for schema, prose, and schema regression coverage; Phase 1 for semantic enforcement and tests.

**Verification:** Reject a declared column named `id`; accept ordinary row IDs and correctly declared data columns; reject missing or undeclared row properties.

## D004 — Define resource counting precisely

**Decision:** Apply these conventions consistently across validation, tests, documentation, and future renderers.

| Quantity       | Counting rule                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Tree depth     | The root is depth 1. Each child is one level deeper than its parent.                               |
| Node count     | Count the root and every descendant, including nodes inside hidden conditional content.            |
| Dataset cells  | Sum `row count × declared column count` across all datasets. Count null cells and exclude row IDs. |
| Chart points   | Count rows where both selected values are non-null, separately for each chart.                     |
| Limit boundary | Exactly the stated limit is allowed; one over is rejected.                                         |

Conditional visibility does not exempt content from validation or resource accounting. A state change must not expose content that was never validated.

These conventions retain the existing limits, including 20 levels, 2,000 nodes, 20,000 dataset cells, and 500 points per chart.

**Contract effect:** Clarifies counting semantics without increasing or decreasing the stated limits.

**Implementation phases:** Phase 0 documentation; Phase 1 validation; later store and rendering work must preserve these invariants.

**Verification:** Test exact boundaries and one-over cases, hidden nodes, null cells, row-ID exclusion, and chart rows skipped because either selected value is null.

## D005 — Enforce the file-size limit on export

**Decision:** An exported file must satisfy the same 5 MiB byte limit as an imported file.

Pretty-printing can make a compact input larger, and edits can increase document size. Import-only size checks could therefore produce a download that Mosaic refuses to reopen.

Export sequence:

1. Validate the current document.
2. Serialize using `JSON.stringify(document, null, 2) + "\n"` as specified.
3. Measure the actual UTF-8 size of the serialized output.
4. Reject output larger than 5 MiB before initiating a download.

On failure, show a clear error and preserve the in-memory document and edits. Do not silently change formatting, truncate content, or raise the limit.

Document this limitation: a near-limit minified input may open successfully but require content reduction before its formatted export fits the limit. The limit is 5 × 1,024 × 1,024 bytes, not a character count.

**Contract effect:** Extends explicit enforcement of the existing file limit to serialized output while retaining the specified serialization format.

**Implementation phases:** Phase 1 serialization; Phase 4 download handling and user feedback.

**Verification:** Cover output at and over the byte limit, multibyte text, growth from formatting, growth from edits, and preservation of edits after a failed export.

## D006 — Stage reference-demo rendering across phases

**Decision:** Introduce initial-state, read-only behavior for state-bound nodes during Phase 2 so the reference demo remains useful throughout development.

The demo contains controls, conditional content, a chart, and a table. Its chart is inside a `when` node, so omitting all state-bound nodes would also prevent the Phase 3 demo chart workflow.

| Phase   | Approved behavior                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2 | Evaluate `when` against the initial state; display `stateValue`; render inputs and toggles disabled; show clear placeholders for charts and tables. |
| Phase 3 | Replace chart/table placeholders with their implementations and enable permitted table-cell edits. State controls remain read-only.                 |
| Phase 4 | Enable state-control mutations and full interactions, together with persistence through download.                                                   |

Unknown component types remain validation errors. The temporary placeholders apply only to known v0.1 components awaiting their scheduled implementation.

**Contract effect:** An approved scheduling clarification. It brings forward only read-only state rendering, not state mutations or later-version features.

**Implementation phases:** Phases 2–4 as listed above.

**Verification:** Confirm initial conditional visibility and state display in Phase 2, the demo's table-to-chart update in Phase 3, and state-control interactions in Phase 4.

## D007 — Explicitly reject prototype-related keys and references

**Decision:** Reject `__proto__`, `prototype`, and `constructor` in dataset names, state keys, column keys, and their corresponding references and bindings.

The identifier regex alone is insufficient: `prototype` and `constructor` match it.

Implementation requirements:

- Enforce an explicit reserved-name check in semantic validation.
- Use `Map` or own-property checks for lookups.
- Avoid generic merging of untrusted objects.
- Continue allowing these words in ordinary text such as Markdown; this is an identifier restriction, not a text-content filter.

**Contract effect:** Enforces an existing security requirement; it does not add a new feature.

**Implementation phases:** Phase 1 validation; Phase 3 store lookup/update behavior; Phase 5 expanded regression coverage.

**Verification:** Cover reserved declarations and references, safe lookup behavior, and ordinary text containing the same words.

## D008 — Require finite numbers without coercion

**Decision:** Require finite numbers wherever the document accepts numeric values, both when validating input and when committing edits.

Valid JSON numeric syntax can exceed JavaScript's finite numeric range. For example, `JSON.parse('1e400')` produces `Infinity`, which is unsuitable for chart calculations and can become `null` during serialization.

Implementation requirements:

- Keep Ajv's strict-number validation enabled.
- Disable type coercion: a string such as `"1200"` must not silently become the number `1200` during document validation.
- Reject non-finite values supplied through parsed text or direct in-memory validation.
- Commit only valid finite numeric values from number controls and table edits.
- Keep invalid intermediate input text local to the UI, as already required by the specification.

**Contract effect:** Makes finite-number enforcement explicit across validation and editing, preserving the existing no-coercion requirement.

**Implementation phases:** Phase 0 validator configuration; Phase 1 core validation; Phases 3–4 editing and controls.

**Verification:** Cover overflowing numeric literals, direct `NaN`/infinity values, numeric strings in numeric fields, and invalid intermediate edit text.

## Phase 0 implementation record — 2026-11-13

- Preserved the supplied plan and schema byte for byte under `docs/reference/`, and the demo under `examples/`.
- Applied D003 to the working schema and added a regression test that permits exactly that amendment relative to the supplied schema. Updated the working specification with all eight approved decisions.
- Defined all 14 node types without React dependencies. The model uses readonly fields and arrays to support the specified immutable update strategy.
- Configured Ajv 2020 with strict finite-number checks, no coercion or mutation, own-property checks, and scalar union types. This remains schema-only tooling until Phase 1 adds the safe import pipeline.
- Selected Vite 8.3.8, React 19.3.1, Vitest 5.1.0, and TypeScript 6.0.3 after checking package engine and peer requirements. The selected TypeScript ESLint tooling requires TypeScript below 6.1, so TypeScript 7 was not selected. All direct versions and the dependency tree are pinned.
- Kept the installed Node 22.18.0 and recorded it in `.nvmrc`. The combined toolchain supports `^22.13.0 || ^24.0.0 || >=26.0.0`; the ESLint and Vitest requirements are stricter than Vite's own minimum.
- Used `node --import tsx` for the TypeScript validation script. This avoids the extra IPC listener used by the `tsx` CLI and works in the restricted development environment.
- Added only the dependencies needed by this phase. Markdown rendering, DOM/component testing, and browser test dependencies remain scheduled for their implementation phases.
- Verified 38 schema tests, typechecking, lint, formatting, example validation, production build, lockfile installation, and a localhost browser smoke check. See [phase-0.md](phase-0.md) for actual commands and outcomes.
- Recorded a development-only dependency audit limitation instead of forcing an unsupported transitive major-version override. Runtime dependency audit reports zero vulnerabilities; details and the upstream advisory are in the Phase 0 report.

D001, D002, D005, D006, D007, and the later-phase portions of D003, D004, and D008 remain implementation requirements. Documentation and schema checks are not substitutes for those future runtime checks.

## Phase 1, step 1 implementation choices — 2026-11-14

- Retain the ten suggested error codes as a fixed typed catalog. Duplicate JSON property names use `INVALID_JSON`; duplicate node/row IDs use `DUPLICATE_ID`; duplicate column keys use `INVALID_DATASET`. No additional code is introduced.
- Use plain readonly `MosaicError` records and a discriminated `ParseResult` with a non-empty failure list. Keep validator-library internals out of the public contract.
- Use RFC 6901 string-form pointers: empty string means the whole document, indices are zero-based, and raw property tokens are escaped. A branded string type adds compile-time checking without runtime wrappers.
- Put the ten resource ceilings and root-depth constant in one dependency-free core module. Freeze shared values and check agreement with schema constraints in tests.
- Supply a small helper to classify already measured limit violations. File-size breaches use `FILE_TOO_LARGE`; other published safety budgets use `RESOURCE_LIMIT`. Do not implement document counting or traversal in this step.
- Follow schema Unicode code-point semantics for Markdown length, independently of UTF-8 byte size. D004's hidden-node, null-cell, row-ID exclusion, per-chart, and inclusive-boundary rules remain normative.
- Document error classifications, path conventions, budgets, and implementation boundaries in [core-contracts.md](core-contracts.md). The source schema and reference files do not change in this step.
- Verified with `npm run check`: 112 tests across four files, strict typecheck, lint, formatting, demo schema validation, and production build all pass. This adds 74 tests to the 38 Phase 0 tests. No runtime enforcement beyond the measured-count helper is claimed.

## Phase 1, step 2 implementation choices

- Use standard `Blob`, `Uint8Array` and `TextDecoder` APIs in the core. OS read failures retain their original promise rejection. Invalid content produces a structured Mosaic diagnostic.
- The parsing stage returns an unvalidated `value: unknown`. The full `ParseResult` success branch is reserved for a document that passes resource preflight, schema, and semantic checks.
- Bound the duplicate scanner's stack using the maximum JSON nesting implied by the existing format and root-depth convention. Build an escaped pointer only when reporting a duplicate or a nesting violation.
- The reference validation command reads its local fixture through the same file API before running the schema check. See [core contracts](core-contracts.md) for the byte, BOM, and text-string rules.

## Phase 1, step 3 implementation choices

- Run one iterative walk before the existing compiled schema check for both direct calls and the demo workflow. A cycle points to the reference that closes it. Track completed objects separately from active ancestors so shared data stays valid and each shared node occurrence counts.
- Keep source parsing and structural validation separately callable. Structural success carries `ok: true`; returning a typed document depends on the next semantic validation step.
- Inspect own property descriptors on direct input and require JSON data properties and dense arrays. The traversal computes a diagnostic pointer only when reporting a failure. See [core contracts](core-contracts.md) for the counting conventions and API.

## Phase 1, step 4 implementation choices

- The public text parser and in-memory validator return the typed document after all validation stages succeed. Source-only reads still provide an unknown value for callers that need that stage.
- Check each dataset once and index its column kinds for chart lookups. Count chart points only if the dataset contains more than 500 rows. Charts that use the same dataset and axis pair can reuse a successful count within the current call.
- Visit all node positions in document order after the depth preflight. The first semantic failure reports a stable error code and the offending JSON Pointer. See [core contracts](core-contracts.md) for examples.

## Phase 1, step 5 implementation choices

- Preserve the specified string return type. Validation or file-size failure throws `MosaicSerializationError` with the original structured diagnostics.
- Use the native JSON formatter with two-space indentation and append one LF. An identity replacer bounds the expansion of repeated string values in directly supplied documents. The final UTF-8 size check uses the text parser’s shared byte counter.
- Keep download handling in Phase 4. The Phase 1 round-trip test encodes the core output and reopens it through the file reader and full validator.

## Phase 4 control implementation choices

- Pass the store's typed `updateState` callback through a renderer context. The viewer subscribes to the current snapshot, so `stateValue`, `when`, and repeated bindings reflect each successful edit together. Standalone renderers without that callback retain disabled state controls.
- Reuse the cell editor's local draft handling and complete finite-decimal parser for numeric state inputs. A text field with `inputMode="decimal"` retains incomplete or invalid spelling for feedback across browsers. Empty fields do not become zero or null. Valid spelling normalizes on blur, and Escape restores the latest committed value. Drafts are UI state and disappear when their control unmounts.
- Use a textarea for editable text inputs so multiline values remain representable without replacing the DOM control during typing. Toggles use native checkboxes. All changes pass through the existing store validation; the schema and node vocabulary remain unchanged.

## Phase 4 download implementation choices

- Read the store's current snapshot at the Download click and pass it through `serializeMosaic` before creating a Blob or object URL. Keep the final formatted UTF-8 byte guard in the serializer; export neither UI drafts nor viewer state.
- Use a local `application/json` Blob and temporary download link. Remove the link immediately and revoke its URL after one second, allowing the browser to consume it. The browser owns the destination and collision handling; the viewer has no handle for overwriting the imported file. Preserve the input filename with a normalized or appended `.mosa` extension.
- Reuse the focused error panel with an explicit open/download operation. Serialization failures retain their structured diagnostics; browser download-start failures get a separate retry message. Neither failure replaces the store or current tab. Disable Download while a new file is being read, and do not claim that starting a download confirms a completed disk save.

## Phase 4 unsaved-change implementation choices

- Keep a boolean dirty flag in the store, outside the document model. Set it before notifying subscribers of a changed, valid cell or state edit. Equal values and rejected edits leave it unchanged. Manual reversion does not clear it; this avoids retaining a second document or performing whole-document comparisons on each edit.
- Clear the flag after a successful download start, only for the exact current snapshot. Failed exports and stale snapshot checkpoints cannot mark newer edits clean. The browser does not provide confirmation of a completed disk save; the checkpoint records download initiation. Dirty-only changes notify subscribers without changing the document snapshot.
- Put one native confirmation check immediately before replacing the current store, after file reading and validation, for Open Demo, Open File, and drag-and-drop. Check the live store at that point to protect edits made during a pending read. Retain the existing request counter so stale reads cannot replace a document or trigger a second prompt after a newer request.
- Cancel clears the incoming loading notice and preserves the current store and document view. Failed imports and file-picker cancellation do not ask for discard approval. Successful replacement creates a fresh clean store. Display the unsaved indicator next to the filename with a polite live announcement.

## Phase 5 security audit implementation choices — 2026-11-18

- Check the parsed Markdown AST iteratively before recursive rendering, with a viewer budget of 128 child edges from the root. Mosaic's node-depth and Markdown-length ceilings do not bound Markdown syntax depth. This budget is a renderer safeguard, not a new format rejection rule.
- Catch Markdown rendering failures within the affected node and display escaped original text with an explanatory note. Preserve the original source for export and reset the boundary when that source changes. Retain raw-HTML/image blocking and the existing URL policy.
- Add source, store, component and production-browser regressions for escaped reserved names, pollution payloads, legal shadow names, hostile values, malicious markup/URLs, deeply nested Markdown, and hostile diagnostic text. Keep packages, schema and format error codes unchanged. See [security-audit.md](security-audit.md) for findings, results and limitations.

## Supporting references

- [RFC 8259, section 4: duplicate object-member interoperability](https://www.rfc-editor.org/rfc/rfc8259.html#section-4)
- [Ajv security guidance: circular references in JavaScript objects](https://ajv.js.org/security.html#circular-references-in-javascript-objects)
- [Ajv options: strict number validation](https://ajv.js.org/options.html#strictnumbers)

These references support the engineering rationale; the supplied Mosaic contract and the approved decisions above define the project's requirements.
