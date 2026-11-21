# Phase 5 — Original production performance baseline

This is the archived pre-optimization report. For current release measurements and readiness, use [benchmarks.md](benchmarks.md) and [release-readiness.md](release-readiness.md). Statements about remaining work below describe the original measurement stage.

Measured **2026-11-19**. All measured timing and bundle budgets passed on the reference machine. The memory experiment found small retained-heap growth during small/medium replacements, so the specification's **no persistent linear growth** criterion is **not yet confirmed**. This report preserves the original baseline. The subsequent [profiled improvement report](performance-improvements.md) records the completed investigation and rendering change, including the remaining native-memory limitation.

## Reproduce and inspect

These are the historical npm commands used for this baseline. For the current Bun checkout, use the [current reproduction commands](benchmarks.md#reproduce-and-inspect).

```sh
npm ci
npx playwright install --only-shell chromium
npm run benchmark
```

The command builds the real production app in `dist/`, then builds a separate production core/render harness under `benchmark-results/harness/`. It starts loopback preview servers on **4175** and **4176**, closes them and Chromium when finished, and writes:

- `benchmark-results/results.json`: every timing sample, median/p95/min/max, memory snapshots, GC checkpoints, environment, fixture/build hashes, budgets, errors and request attempts.
- `benchmark-results/fixtures/{small,medium,large}.mosa`: deterministic validated input files.
- `benchmark-results/harness/`: generated measurement page, excluded from the shipped app.

Generated outputs are ignored by Git. The tables below preserve this run's results; rerunning the command replaces the local generated results. Keep the machine otherwise idle and do not run other browser/test workloads concurrently. Timing misses are reported, not used as unstable CI failures. Invalid fixtures, unexpected DOM/point counts, missing updates, browser exceptions, and document-related requests fail the command.

The implementation is in `scripts/benchmark.ts` and `scripts/benchmarks/`. It reuses existing development dependencies and adds no runtime dependency or application instrumentation. Six tests in `tests/benchmark.test.ts` verify deterministic exact-size fixtures, validation/serialization round trips, percentile definitions, rejection of invalid samples, and retained-memory slope calculation.

## Reference environment

| Property                  | Recorded value                                                   |
| ------------------------- | ---------------------------------------------------------------- |
| CPU                       | Apple M4, 10 logical CPUs                                        |
| RAM                       | 16 GiB                                                           |
| Platform                  | macOS/Darwin 27.2.0, arm64                                       |
| Browser                   | Playwright Chromium 159.0.8154.6, headless                       |
| Node                      | 22.18.0                                                          |
| Build                     | Vite 8.3.8, React 19.3.1, optimized production                   |
| Viewport/theme            | 1280 × 800 CSS pixels, light/blue/comfortable                    |
| Throttling                | None; serial workloads                                           |
| Cache/network             | Application assets loaded first; document operations run offline |
| Runtime baseline commit   | `0255666b93b5c070d3eb2c9131d64bcc9d855cb5`                       |
| Successful run completion | `2026-11-19T12:26:36.188Z`                                       |

The benchmark additions were uncommitted when measured. Application source and dependencies are unchanged from that baseline commit. The raw report records the working-tree paths, lockfile hash and emitted asset hashes. This M4 is the chosen reference device, not evidence for a slower laptop or mobile device. Battery/thermal conditions and unrelated operating-system activity were not controlled.

## Fixtures and measurement boundaries

| Fixture |       UTF-8 bytes | Nodes | Markdown nodes | Rows × columns | Total cells | Points per chart | Initial table rows |
| ------- | ----------------: | ----: | -------------: | -------------: | ----------: | ---------------: | -----------------: |
| Small   |     3,072 (3 KiB) |    14 |              1 |          3 × 3 |           9 |                3 |                  3 |
| Medium  | 102,400 (100 KiB) |   300 |             15 |        250 × 3 |         750 |              250 |                100 |
| Large   | 1,048,576 (1 MiB) | 2,000 |            100 |     1,000 × 20 |      20,000 |              500 |                100 |

Each has one dataset, both bar and line charts, an editable numeric column, saved inputs/toggles, visible conditional content, a card, and Unicode Markdown. All node trees have depth 3. Repeated visible text fills each exact byte budget. The large fixture reaches the node, dataset-row, total-cell and per-chart point ceilings; rows after the first 500 have null chart values. Generation runs the full parser/validator before measurement. These are representative synthetic fixtures, not exhaustive worst-case inputs or compressed-size benchmarks.

Timing measurements use **3 warmups followed by 20 retained samples** per fixture/operation. Median averages the middle pair; p95 uses nearest rank `ceil(0.95 × n)`, so it is the 19th sorted sample for n=20. No measured outlier is discarded. Browser clock resolution means a reported 0.0 ms store time is below resolution, not zero work.

The isolated production harness imports the same `readMosaicFile`, `validateMosaic`, `createDocumentStore`, and `DocumentView` used by the app. It unmounts the previous view before timing a fresh mount. File construction and Playwright transfer occur outside the timer; the measured load includes `File.arrayBuffer()`, strict UTF-8/BOM handling, duplicate-property scanning, JSON parsing, preflight, schema and semantic validation. It does not include an OS file chooser or physical disk latency.

The actual production viewer is measured separately. Preconstructed local Files are delivered through the normal input change handler. A cell edit sets the native input value and dispatches an input event through React's normal edit handler; completion requires **both** chart summaries and SVG geometry to change. Synthetic event dispatch excludes human typing and OS input-device latency. The observer adds some measurement overhead; reported times are not pure React CPU timings.

**DOM** completion is observed with `MutationObserver`. **Paint opportunity** adds two `requestAnimationFrame` callbacks so the browser can perform style/layout and paint between them. This is a conservative synchronization point, not an actual GPU presentation timestamp. It adds a roughly frame-sized floor and makes small differences between operations unreliable. The initial-render harness also waits for two animation frames. Warmups, fixture creation, unmount preparation, transport and forced GC are excluded from timing samples. Loaded-memory experiments and replacement loops run after timing measurements.

## Loading, rendering and editing

All pairs below are **median / p95 in milliseconds**.

| Operation                                                  |         Small |        Medium |         Large |
| ---------------------------------------------------------- | ------------: | ------------: | ------------: |
| File read, strict decode, duplicate scan and parse         |   0.70 / 1.00 |   0.60 / 0.70 |   4.00 / 4.30 |
| Preflight, schema and semantic validation                  |   0.40 / 0.70 |   0.90 / 1.10 |   4.00 / 5.10 |
| Combined read through validation                           |   1.10 / 1.70 |   1.55 / 1.80 |   8.00 / 8.90 |
| Store construction                                         |   0.00 / 0.10 |   0.00 / 0.10 |   0.15 / 0.20 |
| Validated document through initial render, including store | 32.05 / 33.30 | 31.85 / 32.30 | 59.65 / 64.20 |
| Actual viewer file change → new document DOM               |   2.15 / 2.40 |   5.90 / 6.40 | 20.75 / 29.90 |
| Actual viewer file change → paint opportunity              | 30.60 / 31.30 | 32.55 / 33.60 | 71.00 / 81.10 |
| Cell edit → both affected charts' DOM                      |   1.70 / 2.10 |   3.25 / 3.60 |   6.00 / 6.50 |
| Cell edit → paint opportunity                              | 30.75 / 32.20 | 31.90 / 33.20 | 32.10 / 32.70 |
| Show 100 more rows → DOM                                   |           n/a |   4.20 / 4.60 |  9.80 / 11.30 |
| Show 100 more rows → paint opportunity                     |           n/a | 30.40 / 31.20 | 23.55 / 27.10 |

Each summary is computed independently; medians/p95 of stages should not be added to reconstruct combined percentiles. The last two rows measure the existing progressive table implementation. The runner asserts that medium/large initially mount 100 rows, then verifies a button activation adds exactly another 100. Chart edits are measured after resetting the table to its initial 100 rows. The lower large-table paint-opportunity time reflects frame alignment, not lower CPU cost; its DOM work is higher.

## Repeated replacements and memory

There is no Close command in v0.1. One cycle opens the fixture, then replaces it with the same minimal valid document containing an empty column. This exercises disposal of the previous store, React tree, table editors and chart observers without adding a product feature. After three warmup pairs, each fixture runs **100 cycles / 200 opens**. The experiment therefore measures **300 cycles / 600 opens** across the three sizes. Results below cover all 100 samples, including normal allocation/GC costs; forced-GC checkpoints are outside the timers.

| Fixture | Open fixture, median / p95 ms | Replace with baseline, median / p95 ms |
| ------- | ----------------------------: | -------------------------------------: |
| Small   |                 30.90 / 32.60 |                          31.50 / 32.80 |
| Medium  |                 32.55 / 33.50 |                          30.90 / 31.80 |
| Large   |                 67.60 / 76.60 |                          29.00 / 31.40 |

Loaded-memory measurements use **10 baseline/loaded pairs** per fixture after the timing warmups. Every baseline and loaded snapshot is collected after forced GC; an additional snapshot immediately before loaded GC records transient allocations. Values below are **median / p95 in MiB**. JavaScript and embedder heap are separate CDP measurements; they are not process RSS or total browser memory and should not be added to claim total consumption.

| Fixture | Baseline JS heap, median | Loaded JS before GC | Loaded JS after GC | Loaded embedder heap after GC | Loaded DOM nodes after GC |
| ------- | -----------------------: | ------------------: | -----------------: | ----------------------------: | ------------------------: |
| Small   |                    5.782 |       6.094 / 6.133 |      5.846 / 5.875 |                 0.906 / 1.026 |                       230 |
| Medium  |                    6.121 |       8.027 / 8.154 |      6.986 / 7.029 |                 5.234 / 5.237 |                     2,669 |
| Large   |                    6.486 |     10.771 / 13.993 |      9.027 / 9.043 |               22.879 / 22.935 |                    10,513 |

These are whole measured-page values, including React, validation code, the fixed benchmark observer/File corpus and warmed browser/JS caches. They are not isolated document object sizes or peak-memory measurements. The separate render harness is closed before these experiments. The order is small → medium → large in one browser session; differences in baseline include warmup/cache history. The raw snapshots also include heap capacity, backing storage, element counts, document counts and event-listener counts.

During replacements, the runner settles rendering, forces GC and samples at cycles 0, 10, …, 100. An additional **100-cycle idle control** uses the same automation/settling/GC cadence without opening documents. It is diagnostic context, not a value subtracted from application measurements.

| Experiment          | JS heap start → end, MiB | Change, KiB | Least-squares bytes/cycle, all / cycles 50–100 |
| ------------------- | -----------------------: | ----------: | ---------------------------------------------: |
| Small replacements  |            6.087 → 6.234 |     +150.32 |                                +1,548 / +1,967 |
| Medium replacements |            6.343 → 6.460 |     +120.30 |                                +1,327 / +1,103 |
| Large replacements  |            6.651 → 7.285 |     +648.75 |                                  +3,085 / −452 |
| Idle control        |            7.285 → 7.288 |       +3.09 |                                      +14 / +45 |

Manual inspection of the checkpoint series found:

- Every baseline checkpoint returned to **1 document, 68 DOM nodes, 36 elements, 178 JS event listeners**, and zero table/chart rows/points. There is no accumulating detached DOM count visible in these counters.
- Small and medium retained JS heap continue to drift upward over the last 50 cycles, above the idle control. Stable DOM counts alone cannot explain or dismiss that growth.
- Most of the large JS-heap increase occurs by cycle 10. Over the same interval, backing storage falls from about 1.14 MiB to 0.50 MiB, so V8's representation/accounting changes may contribute; no causal diagnosis is established. Large JS heap then largely plateaus, with a slightly negative late slope. Large embedder heap still trends upward from about 0.97 MiB at cycle 10 to 1.06 MiB at cycle 100.

**Memory acceptance remains unconfirmed.** The measurements do not prove retained document objects or an application leak, but also do not establish absence of persistent growth. The next profiling step should compare heap allocation/retainer snapshots and longer runs, including browser bookkeeping, generated identifiers/strings, and application subscriptions/observers. No speculative runtime optimization was made in this measurement step.

## Production bundle and budgets

The runner reads the real `dist/assets/` outputs, records SHA-256 hashes, and compresses each independently with **Node zlib gzip level 6**. It conservatively sums all emitted JavaScript chunks, including any future lazy chunks. The benchmark harness is excluded. The current app has one JavaScript and one CSS asset.

| Asset      | Minified bytes | Gzip bytes | Gzip KiB |
| ---------- | -------------: | ---------: | -------: |
| JavaScript |        513,313 |    154,210 |   150.60 |
| CSS        |         10,381 |      3,060 |     2.99 |

Vite's own compressor reports **513.31 kB / 155.82 kB gzip** for JavaScript and **10.38 kB / 3.07 kB gzip** for CSS. These are different compressor outputs and decimal units; both JS gzip measurements are below 250 KiB. The existing **500 kB uncompressed chunk warning remains**. This step does not change bundle contents or add code splitting.

| Specification budget                                    | Measurement                                          | Outcome on this reference machine |
| ------------------------------------------------------- | ---------------------------------------------------- | --------------------------------- |
| Reference demo <10 KiB                                  | 2,543 bytes / 2.48 KiB                               | Met                               |
| Initial JS aim ≤250 KiB gzip                            | 150.60 KiB; all emitted JS counted                   | Met                               |
| 1 MiB read/decode/parse/validate median ≤200 ms         | 8.00 ms                                              | Met                               |
| 300-node initial render after validation median ≤500 ms | 31.85 ms, including store construction               | Met                               |
| Single edited cell → affected chart median ≤100 ms      | Slowest fixture median 32.10 ms; both charts checked | Met                               |
| Local-document network requests =0                      | 0 attempts while offline                             | Met                               |
| 100 cycles: no persistent linear memory growth after GC | Small/medium drift above idle; large late plateau    | Unconfirmed; profiling required   |

## Scope and next work

Verification completed: `npm run benchmark` finished all timing/memory/replacement/control runs with **zero browser exceptions and zero document-related request attempts**. `npm run check` passed strict TypeScript, ESLint, formatting, **587 unit/integration tests across 26 files**, reference-demo validation, and the production build. Six of those tests are the new benchmark-evidence tests. The normal production JS/CSS hashes remain unchanged; this step changes measurement tooling and documentation only.

The longest measured user-facing operation is opening the large fixture. Its read/validation time is small compared with the complete render/frame path, but these measurements alone do not identify a React, Markdown or layout bottleneck. `NodeRenderer` currently traverses the document again after edits; it remains a candidate for profiling, not evidence that new memoization or subscriptions are necessary. All current timing budgets passed without reducing validation, changing resource limits or adding dependencies.

This report does not establish cold application startup, physical disk speed, 5 MiB maximum-size latency, deeply nested/adversarial Markdown performance, many simultaneous charts, a fully expanded 1,000-row editable table, peak process/GPU memory, WebKit/Firefox performance, or mobile responsiveness under load. Earlier functional browser checks remain separate evidence. Warm-cache serial timings on one fast machine must not be treated as a universal latency guarantee.

The benchmark task is checked off in the working specification. The [profiling follow-up](performance-improvements.md) now records the targeted rendering improvement and extended memory investigation. The final compatibility/limitations/release report remains outstanding and must carry the unresolved browser-memory limitation.
