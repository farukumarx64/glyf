# Mosaic v0.1 — Engineering decisions

## Status and scope

- **Accepted:** 2026-11-13, by the project owner in the design-review conversation.
- **Implementation status:** Phase 0 completed and verified on 2026-11-13. Phase 1, step 1 (errors and resource limits) completed and verified on 2026-11-14; remaining steps are pending.
- **Format version:** `0.1.0`.
- **Scope:** Clarify and harden the existing v0.1 contract without introducing later-version features.

The owner accepted all eight recommendations below. They are approved decisions, not unresolved proposals. Implementation must follow them alongside the supplied specification and schema. Where a decision amends the original specification or schema, the amendment is identified explicitly below.

Reference documents supplied for the review:

- `MOSAIC_V0.1_TECHNICAL_SPEC_AND_BUILD_PLAN.md`
- `mosaic-v0.1.schema.json`
- `mosaic-demo.mosa`

The supplied originals remain unchanged and are retained in `docs/reference/`; the demo is preserved in `examples/`. The owner subsequently authorized Phase 0 on 2026-11-13 and only the error/resource definitions step of Phase 1 on 2026-11-14. The working schema and `docs/SPEC_V0.1.md` explicitly incorporate the approved contract amendments. Remaining implementation steps require a separate instruction.

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

## Supporting references

- [RFC 8259, section 4: duplicate object-member interoperability](https://www.rfc-editor.org/rfc/rfc8259.html#section-4)
- [Ajv security guidance: circular references in JavaScript objects](https://ajv.js.org/security.html#circular-references-in-javascript-objects)
- [Ajv options: strict number validation](https://ajv.js.org/options.html#strictnumbers)

These references support the engineering rationale; the supplied Mosaic contract and the approved decisions above define the project's requirements.
