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

## Phase 5 accessibility implementation choices — 2026-11-19

- Recover focus to the existing Preview panel only when its previously focused element has disappeared and focus has fallen to the page body. Preserve surviving/external focus; forget detached elements and clear the remembered element when leaving Preview.
- Give Markdown code blocks a named keyboard focus target and remove unnamed anchors after disabled images are removed. Preserve source text, formatted link labels and the existing URL policy.
- Separate control-border contrast from decorative rules using a trusted light/dark CSS token. Keep the format and dependency set unchanged.
- Record actual keyboard, accessibility-tree, live-region relationship, reflow and computed-contrast checks in [accessibility.md](accessibility.md). Distinguish automated browser evidence from unperformed screen-reader speech testing.

## Phase 5 performance measurement choices — 2026-11-19

- Use the existing Playwright, Vite, and TypeScript development dependencies. Keep benchmark observers and the separate production core/render harness outside the shipped app. Measure normal file-change and cell-input handlers in the actual production viewer without exposing a runtime testing API.
- Generate exact-size valid fixtures locally: 3 KiB/14 nodes, 100 KiB/300 nodes, and 1 MiB/2,000 nodes. Include Markdown, conditional content, editable tables, bar/line charts, negative values and null-skipped points; exercise the large document's 20,000-cell ceiling with 500 plotted points per chart. Keep generated large documents out of Git.
- Record all 20 timing samples after three warmups, with median and nearest-rank p95. Distinguish read/parse, validation, store construction, initial rendering, actual viewer replacement, and cell-to-chart updates. A two-frame wait indicates a paint opportunity, not a GPU presentation timestamp; local File construction and automation transport are excluded.
- Use 10 paired baseline/loaded memory samples, 100 open-to-baseline cycles per fixture, forced-GC checkpoints every 10 cycles, and an idle control. Report JavaScript heap, embedder heap, backing storage, DOM and listener counts with their scope. There is no Close action in v0.1, so a minimal valid replacement releases the previous document. Do not infer leak freedom from stable DOM counts alone.
- Measure emitted production assets with gzip level 6, retain input/build hashes, and compare against the specification's budgets. Keep performance results separate from correctness assertions and leave profiling/fixes as the next explicit Phase 5 step. See [benchmarks.md](benchmarks.md).

## Phase 5 profiled rendering implementation choices — 2026-11-19

- Reuse Markdown's rendered subtree in a mounted `React.memo` component whose only prop is its text. CPU samples showed unchanged Markdown processing during cell edits; the optimization does not compare whole document snapshots or change state/dataset subscriptions. Keep the anchor wrapper responsive to its props and the error boundary keyed by text.
- Keep reuse local to the component lifetime. Hidden/unmounted/replaced Markdown starts fresh, with no global string/AST cache and no retained document history. Preserve URL checks, raw HTML/image blocking, depth checking and rendering-error recovery.
- Add an isolated production profiling command with source maps, 500 replacement cycles, raw heap snapshots and 100-edit CPU samples. Use snapshot field metadata and source-map/ancestor attribution when summarizing evidence; never equate self-size differences with retained sizes or profiler samples with end-to-end latency.
- Report the observed edit-time improvement separately from unchanged frame-wait/loading timings. Classify most measured JS growth as VM code/warmup based on snapshots, while retaining the unresolved native style-engine growth as a release limitation. Do not add speculative application cleanup or weaken accessibility to hide browser retention. See [performance-improvements.md](performance-improvements.md).

## Phase 5 release-readiness recording — 2026-11-19

- Treat the ten §14 Definition of Done statements as an implementation checklist with an explicit evidence map, not as authority to publish or deploy. Keep the unconfirmed §7 memory target and host-specific constraints visible after checking the implementation items.
- Make `docs/benchmarks.md` the current optimized results report and preserve the original measurements in `docs/benchmark-baseline.md`. Reuse measured timings only after confirming emitted asset hashes match the candidate; do not invent or relabel a new benchmark run for documentation changes.
- Publish the exact v0.1 compatibility contract and remaining limitations in repository documentation. Preserve the schema, reference files, format limits and future-version boundaries.
- Verify an isolated locked install, dev startup and production browser workflows. Refresh dependency audits without automatic upgrades: zero production findings and eight moderate development-tool findings at review time. Record cache/network conditions rather than claiming a clean-room online install.
- Record the observed production CSP failure: runtime Ajv compilation is blocked when `script-src` excludes `unsafe-eval`. This is a deployment gate requiring a separate resolution; do not silently weaken a host policy or describe CSP compatibility as verified. See [release-readiness.md](release-readiness.md).

## Strict-CSP startup follow-up — 2026-11-20

- Precompile only the trusted repository schema with Ajv's standalone generator. Preserve Draft 2020-12 and every existing compiler option; leave resource preflight, semantic checks and public diagnostics unchanged.
- Use the existing Vite dependency to bundle standalone CommonJS output and its Unicode-length helper into an import-free ES module. Track the generator and TypeScript declaration; ignore generated JavaScript. Regenerate before the supported build/dev/test commands and stop on generation failure, with no browser compilation fallback.
- Move Ajv to development dependencies without changing any locked package version, resolution or integrity. No runtime dependency or later-version feature is added.
- Guard compatibility with compiler-versus-standalone diagnostic tests and a production Chromium/WebKit workflow under the exact CSP that exposed the failure. Resolve R2 for that policy while retaining inline styles and the documented limits of host-policy coverage.
- Record the new bundle size separately from prior latency/memory measurements; do not attribute unmeasured timing or memory improvements to precompilation.

## Development-dependency audit follow-up — 2026-11-20

- Refresh the audit before choosing versions. All eight moderate findings trace to minimatch's globparts-amplification advisory through ESLint and TypeScript ESLint; upgrade the direct consumers through their supported dependency ranges.
- Pin ESLint 10.15.0 and typescript-eslint 8.73.0 exactly. Keep the existing Node/TypeScript requirements and lint rules. Resolve minimatch to one patched 11.0.9 instance without overrides or a forced audit fix.
- Review the complete lockfile change: 14 development-only package entries change and one duplicate is removed; production package entries remain identical. Retain the aligned TypeScript ESLint family and the resolver's ignore patch update.
- Record zero findings in both the complete and production-only audits, preserve the historical audit records, and verify the upgrade with a fresh locked install and the existing project/browser checks. See [release-readiness.md](release-readiness.md#development-dependency-follow-up--2026-11-20).

## Memory-stability follow-up — 2026-11-20

- Measure idle, small and large workloads for 1,000 cycles each in separate fresh browser processes, serially across two Chromium versions and WebKit. Record exact versions and production hashes; do not relabel historical timing measurements.
- Use measurement-only weak references to distinguish retained document/view objects from native browser structures. Count every expected fixture parse and prune dead references; ship no instrumentation or runtime dependency.
- Preserve raw Chromium snapshots and report JavaScript/code groups, native media-query counts and process RSS separately. Mark WebKit CDP measurements unavailable and its macOS PID-tree RSS incomplete because launchd owns the renderer/GPU/network XPC processes.
- Preserve a standalone plain-HTML table/div probe: both tested Chromium versions reproduce native retention without Mosaic or React. Keep semantic table accessibility and application behavior unchanged; no application workaround is justified by this evidence.
- Keep the no-persistent-growth target unconfirmed where native growth persists. Base any application change on demonstrated application ownership, not a rising process-memory total. See [memory-stability.md](memory-stability.md) for the completed investigation and disposition.

## Public-release check boundaries — 2026-11-20

- Separate direct manual screen-reader/browser observations from automated accessibility assertions. Record native control failures without an implied VoiceOver/Safari pass; provide concrete fixtures and a checklist. The 2026-11-21 Brave capture/demo recovery is partial evidence only: M01 remains incomplete, and no screen-reader output was observed.
- Extend automated coverage using the existing installed Brave executable and isolated test profiles. Preserve its 34-test result separately from the existing 68 Chromium/WebKit tests and from manual native-dialog/speech coverage.
- Keep Mosaic provisional after identifying closely related declarative visualization software and other existing uses. Treat public-use and npm namespace evidence as collision findings, not trademark status or legal clearance.
- Record the user-confirmed worldwide launch scope and unavailable USPTO/WIPO/PRONOM/extension-directory checks explicitly. Worldwide distribution does not imply worldwide trademark clearance; document national/regional search coverage and unresolved gaps. A missing accessible result does not establish availability. Keep `.mosa` working/unregistered and preserve the format marker/schema until a separately approved identity/compatibility decision.
- Keep public release uncleared while these gates are open. Independent pre-release preparation can continue; publishing remains a separate action. See [public-release-checks.md](public-release-checks.md).

## Pre-release task planning — 2026-11-21

- The native capture failure can be deferred while independent work proceeds. Preserve the manual checklist's incomplete status and the outstanding naming, extension and memory decisions.
- Record the user's request to adopt **Bun instead of npm as the package manager** as a later pre-release task, not an instruction to migrate immediately. Preserve the current npm setup until the migration is implemented and verified.
- Scope the migration to dependency installation, lockfile management and project commands. Keep existing Node-based tooling where required; runtime, bundler and test-runner replacement are separate decisions. Validate fresh installs, dependency versions, install-script trust, generated validators and all existing checks.
- Track proposed CI, documentation and candidate-packaging work alongside the existing release decisions in the [pre-release work list](release-readiness.md#pre-release-work-list--2026-11-21). Preparation does not grant public-release clearance or expand v0.1 format scope.

## Bun package-management migration — 2026-11-21

- The subsequent explicit request implements the planned migration. Pin **Bun 1.3.14**, retain the existing Node engine range and `.nvmrc`, and replace `package-lock.json` with `bun.lock` after checking every locked package version, integrity and dependency requirement against the original graph.
- Keep Vite, Vitest, Playwright and existing Node scripts. Use `bun run test` for Vitest, pass script arguments directly, and invoke local package binaries through `bun run`. Do not enable Bun's Node alias.
- Replace `.npmrc` exact-save configuration with `bunfig.toml`. Bun 1.3.14 does not enforce the old `engine-strict` setting; a dependency-free root preinstall guard checks the actual Bun version and Node executable against `package.json`.
- Allow dependency lifecycle scripts only for esbuild. The locked fsevents package already supplies its native binary and needs no install hook. A clean installation reports zero untrusted dependencies with scripts.
- Update current setup/reproduction commands and benchmark lockfile fingerprints; preserve dated npm results and the supplied reference specification. This does not upgrade dependencies or change the v0.1 format or viewer behavior. See [verification and limits](bun-migration.md).

## Continuous integration — 2026-11-21

- Add one GitHub Actions job on Ubuntu 24.04 for pull requests, pushes to `main` and manual dispatch. Reuse `bun run check`, then run Playwright against its production build; avoid rebuilding the same viewer for browser tests.
- Read Node and Bun versions from `.nvmrc` and `package.json`, install from the frozen Bun lockfile and generate the ignored Ajv validator from source. Pin external actions to reviewed full commit SHAs; give the job only repository read permission and disable persisted checkout credentials.
- Install the pinned Playwright package's Chromium/WebKit browsers and Linux dependencies. Run one browser worker in CI, reject focused tests, bound the suite duration and upload available reports plus failure screenshots/traces for seven days. Keep local browser parallelism unchanged and retain the existing zero-retry behavior.
- Keep package dependencies and browser installations fresh rather than introducing caches that could obscure clean-install failures. Bun's setup action may cache its versioned executable. Cancel superseded runs for the same event/ref.
- Record local CI-mode checks separately from an actual GitHub-hosted run. Branch protection, public deployment, native screen-reader verification and performance acceptance remain separate work. See [CI operation and verification](ci.md).

## User documentation — 2026-11-21

- Put local setup and a route into the first document near the top of README. Link the pinned Node/Bun installation sources, verify executable versions, distinguish the development server from a built production preview, and keep contributor/API details available below.
- Add a separate [user guide](user-guide.md) with a demo walkthrough, typed editing rules, progressive table rows, download/reopen steps, replacement behavior, keyboard use and offline-after-load scope. Explain that accepted edits update immediately, invalid drafts are excluded from saved data, Download creates a new browser-managed file, and refresh/close has no autosave or navigation guard.
- Add [troubleshooting](troubleshooting.md) for installation/ports, structured error codes and JSON Pointers, failed edits, Markdown policy and export-size failures. Explain No value versus empty text, the formatted-export byte limit, and the limits of recovery after a browser refresh. Keep code-generation and hosting details in setup/troubleshooting rather than ordinary editing instructions.
- Present current limitations and browser evidence without implying manual screen-reader, physical-mobile or hosted-CI verification. User documentation is prepared; final release wording still depends on the existing identity/release decisions. No runtime, format or dependency change is included.
- Verification: checked 108 local file/heading links, 41 package-command references and shell-block syntax; formatting and the documented production build/preview passed. The exact demo walkthrough passed in automated Chromium and WebKit, including invalid-draft restoration, cancelled replacement, offline download/reopen, malformed-file recovery, No value behavior and lack of reload recovery. This is browser automation, not native file-dialog or screen-reader evidence. Local logs/results are in ignored `benchmark-results/user-docs/`.

## First hosted CI failure — 2026-11-21

- Inspect the actual GitHub Actions log before changing configuration. The first Ubuntu run installed successfully and passed typecheck, lint, formatting and 608 tests; one full-size nested-emphasis recovery test took 8.910 seconds and hit the default five-second timeout.
- Give only the two maximum-size hostile Markdown recovery cases a 30-second allowance. Preserve every input and assertion, the ordinary depth-boundary timeouts, and the absence of retries. These cases establish safe recovery and immutability, not a five-second parsing target; synchronous Markdown parsing remains a documented limitation.
- Keep the first hosted failure separate from local correction verification. Update the setup/release evidence without claiming a hosted browser pass before the correction is pushed and run. See [the CI incident record](ci.md#first-hosted-run-and-timeout-correction--2026-11-21).

## Supporting references

- [RFC 8259, section 4: duplicate object-member interoperability](https://www.rfc-editor.org/rfc/rfc8259.html#section-4)
- [Ajv security guidance: circular references in JavaScript objects](https://ajv.js.org/security.html#circular-references-in-javascript-objects)
- [Ajv options: strict number validation](https://ajv.js.org/options.html#strictnumbers)

These references support the engineering rationale; the supplied Mosaic contract and the approved decisions above define the project's requirements.
