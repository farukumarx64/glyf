# Phase 5 — Profiled rendering improvement

Measured **2026-11-19**, following the [production baseline](benchmarks.md). The targeted change avoids reparsing unchanged Markdown during dataset/state updates. On the same Apple M4/16 GiB/Chromium 159.0.8154.6 profile, the large fixture's median cell-to-chart DOM update fell from **6.00 ms to 3.40 ms**. The memory investigation identified VM warmup and native browser retention; this change does **not** claim to fix those memory trends.

## Evidence and implementation

The original production CPU profile sampled 100 large-document cell edits after 10 warmups, at a requested 100 µs interval. The fixture contains 100 unchanged Markdown nodes. The source-mapped profile attributed **205.06 ms** of sampled time to Markdown processing stacks, including parser construction, tokenization, AST conversion and rendering. `MarkdownView` received every new document snapshot and recreated the Markdown processing subtree on each edit, although its text had not changed.

`src/render/MarkdownView.tsx` now puts the content inside a small `React.memo` component whose only prop is the Markdown text. The wrapper still updates its anchor normally. Reuse belongs to the mounted component: hiding it, switching away from Preview, or replacing the document unmounts it. There is no global text/AST cache, retained document history, custom comparison of document objects, or new dependency. Initial rendering still parses every visible Markdown node once.

Text changes still run the same parser, depth guard, URL policy, HTML/image blocking and error boundary. The boundary remains keyed by text, so recovery from failed Markdown rendering remains possible. Layouts, `when`, inputs, state values, tables and charts continue receiving current snapshots. Nothing about the `.mosa` contract, validation, serialization or resource limits changed.

In the matching optimized CPU profile, **no samples fell under Markdown processing stacks** during the 100 edits. This is a sampling result, supported by deterministic tests that count Markdown pipeline executions. Sampled garbage-collector time also fell from 128.57 to 44.69 ms, but that is diagnostic evidence, not a stable latency guarantee.

## Before/after benchmark

The original 20-sample benchmark was rerun unchanged: the same three fixture hashes, three warmups, initial table-row counts, two affected charts, production build and offline workflow. Pairs below are **median / p95 in milliseconds**.

| Fixture                   | Cell → chart DOM, before | Cell → chart DOM, after | Median reduction |
| ------------------------- | -----------------------: | ----------------------: | ---------------: |
| Small, 1 Markdown node    |              1.70 / 2.10 |             1.50 / 2.00 |              12% |
| Medium, 15 Markdown nodes |              3.25 / 3.60 |             1.90 / 2.30 |              42% |
| Large, 100 Markdown nodes |              6.00 / 6.50 |             3.40 / 3.60 |              43% |

The small result is close to clock/scheduling noise; the meaningful improvements are in medium/large work and the eliminated processing verified by tests and CPU samples. Both chart summaries and SVG geometry are checked after each edit.

The two-animation-frame metric remains about **32 ms**. Large-document initial rendering is also effectively unchanged: **59.65 → 60.05 ms median**, including store construction, while actual viewer opening is **71.00 → 71.00 ms**. Large read/decode/parse/validation is **8.00 → 8.10 ms**. This change saves edit-time CPU/allocation work; it does not establish faster initial loading or a visible frame-time improvement. All specified timing budgets remain met on the reference machine.

Production JavaScript changes from **513,313 → 513,366 minified bytes** and **154,210 → 154,213 gzip bytes** using the benchmark's Node zlib level 6. That is **53 raw bytes / 3 gzip bytes**. CSS and dependencies are unchanged, and gzip JS remains below 250 KiB. Vite's existing uncompressed-chunk warning remains.

The preserved original run completed at `2026-11-19T12:26:36.188Z`; the optimized benchmark completed at `2026-11-19T18:09:06.287Z`. The runtime baseline is commit `68a6a63` (its application code matches the earlier measured runtime). CPU/heap profiles were taken during this follow-up with production source maps. Source maps are generated only into the ignored profiling directory and do not ship in `dist/`. Results are single-machine observations, not cross-device guarantees or an A/B confidence interval.

## Memory investigation and disposition

The 100-cycle benchmark still shows retained heap drift. To investigate, production heap snapshots were captured after **0, 100, 300 and 500 small-document replacement cycles**, both before and after the rendering change. Each cycle opens the fixture and then a minimal baseline. Snapshot collection forces GC and runs separately from the standard timing benchmark.

| Cycle                    | Before change, JS heap bytes | After change, JS heap bytes |
| ------------------------ | ---------------------------: | --------------------------: |
| 0, after 3 warmup cycles |                    5,159,572 |                   5,160,952 |
| 100                      |                    6,050,152 |                   6,050,056 |
| 300                      |                    6,386,220 |                   6,389,112 |
| 500                      |                    6,428,644 |                   6,432,144 |

Snapshot comparison explains much of the earlier ambiguity:

- Most early JS growth is V8 **instruction streams, trusted byte arrays, code objects and feedback structures**. In the original 0–100 interval, instruction streams alone increased by 559,744 self bytes; trusted byte arrays increased by 163,900 bytes. These are VM compilation/warmup structures, not saved Mosaic document snapshots.
- In the original 300–500 interval, JS heap grew by 42,424 bytes rather than continuing the initial rate. The snapshot comparison showed no net growth in ordinary JS `object` or `closure` groups in that interval. Code structures dominated the remaining JS growth. The optimized run behaves similarly; no memory reduction is claimed.
- Every baseline checkpoint still has **1 document, 68 DOM nodes and 178 JS event listeners**. This bounds the observed DOM/listener retention but is not proof that every possible leak is absent.
- Native **`blink::MediaQuerySet`** objects and their associated structures continue to increase by roughly one set per fixture cycle. Inspection of a newly retained set's strong-reference path led through a native hash table to **`StyleEngine → HTMLDocument`**. Native layout-shift entries also grow early, then stop growing in the observed late interval. These are browser-side retained structures; the snapshots did not identify an expanding Mosaic store/subscription chain.

**The specification's no-persistent-memory-growth criterion remains unconfirmed.** JS warmup explains most of the measured JS increase, but native style-engine retention continues in this browser. Stable ordinary object counts alone do not prove leak freedom. No application cleanup was added without an identified application retention path, and no document feature or accessibility behavior was removed to suppress the measurement. Carry this browser-specific limitation into the release report; longer runs and other browser versions are needed before making a broad memory-stability claim.

## Reproducible profiling tools

The new command uses existing Vite, Playwright, TypeScript and Node libraries:

```sh
npm run profile -- investigation small
# Optional different replacement fixture; the CPU workload always edits the large fixture:
npm run profile -- large-investigation large
```

Labels accept lowercase letters, digits and hyphens. The runner serves an isolated production build with source maps on loopback port **4177**, preloads assets, and performs document operations offline. It writes `benchmark-results/profile-<label>/` containing:

- `0.heapsnapshot`, `100.heapsnapshot`, `300.heapsnapshot`, `500.heapsnapshot`, suitable for DevTools comparison and retainer inspection.
- `edits.cpuprofile`, the raw 100-edit CPU sample stream.
- `summary.json`, with environment identifiers, heap/DOM/listener checkpoints, per-type/name self-size differences, source-mapped sampled CPU groups, errors and request attempts.

Heap self-size differences are not retained/dominated sizes. CPU categories attribute each sample once, considering its ancestor stack to include native work under Markdown. Sampled times include profiler overhead and must not be substituted for the separate uninstrumented latency measurements. Run profiling and benchmarks serially, without other heavy workloads.

Current local evidence is in `benchmark-results/before-results.json`, `benchmark-results/results.json`, `benchmark-results/profile-before/`, and `benchmark-results/profile-after/`. These generated artifacts are ignored by Git; the report preserves the findings and numerical comparison.

## Regression coverage and verification

Four new component tests verify that:

1. Cell/state edits and conditional charts update immediately without reprocessing unchanged Markdown.
2. Anchor changes remain visible; changed Markdown text is reprocessed through the original safety policies.
3. Hidden Markdown is not processed, and hiding/showing it starts a fresh mounted instance.
4. Document replacement with identical Markdown and IDs starts a fresh instance rather than retaining a cross-document cache.

Two profiling-summary tests verify source-map/ancestor attribution without double-counting and distinguish code-size growth from ordinary object release using the snapshot's field metadata. Existing security and Markdown error-recovery tests continue to cover safe rendering and recovery from changed text.

`npm run check` passed **593 tests across 28 files**, strict TypeScript, ESLint, formatting, reference-demo validation and production build. The production benchmark and optimized 500-cycle profile completed with **zero page exceptions and zero document-related request attempts**. The full production Playwright suite passed **66 Chromium/WebKit tests**, including security, failed rendering recovery, keyboard/accessibility, edits, downloads, reopening and error recovery.
