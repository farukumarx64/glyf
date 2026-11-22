# Mosaic v0.1 — Release performance report

**Historical verification record:** Names, measurements and counts below describe the builds recorded at the time. The current rc.3 format uses the `glyf` marker, `.glyf` files and Glyf APIs; see [the current contract](compatibility.md#glyf-name-and-file-extension). These results are not new rc.3 measurements.

Consolidated **2026-11-19** for candidate commit **`0259136`**, using the optimized production measurements from **`2026-11-19T18:09:06.287Z`**. The measured renderer change was subsequently committed as `90c2723`; emitted JS/CSS SHA-256 hashes matched that reviewed production build. **The 2026-11-20 strict-CSP change replaces runtime schema compilation, so these timing/memory samples describe the earlier build.** Its new bundle measurements are recorded separately below; these older timing/memory samples are not relabeled. The [2026-11-20 memory follow-up](memory-stability.md) separately measures the current build across three browser profiles.

**The recorded timing and bundle budgets were met on the reference machine. Memory stability remains unconfirmed.** The [release-readiness report](release-readiness.md) records the Definition of Done and remaining limitations. The [original baseline](benchmark-baseline.md) and [profiling follow-up](performance-improvements.md) preserve the before/after evidence.

## Reproduce and inspect

```sh
bun install --frozen-lockfile
bun run playwright install --only-shell chromium
bun run benchmark
# Optional extended heap/CPU investigation:
bun run profile investigation small
```

Run one workload at a time without competing heavy work. The benchmark builds the real app into `dist/`, then a separate production core/render harness into the ignored `benchmark-results/harness/`. Loopback servers use ports **4175** and **4176**; profiling uses **4177**. The harness and profiling source maps do not ship in the app.

`benchmark-results/results.json` contains every timing sample, medians/p95/min/max, heap/DOM/listener checkpoints, fixture/build/lockfile hashes, environment, budgets, page errors and request attempts. Synthetic documents are generated under `benchmark-results/fixtures/`, not committed. Subsequent runs replace local generated results; this report preserves the measured release values. Profiling separately writes `.heapsnapshot`, `.cpuprofile` and `summary.json` artifacts.

Incorrect fixture/render/update behavior, page exceptions and document-related requests fail the runner. Timing thresholds are reported rather than used as noisy CI assertions. No new runtime dependency was added for measurement or optimization.

## Reference environment and method

| Property           | Value                                                                           |
| ------------------ | ------------------------------------------------------------------------------- |
| CPU / RAM          | Apple M4, 10 logical CPUs / 16 GiB                                              |
| Platform           | macOS/Darwin 27.2.0, arm64                                                      |
| Browser            | Playwright Chromium 159.0.8154.6, headless                                      |
| Toolchain          | Node 22.18.0; Vite 8.3.8; React 19.3.1; production build                        |
| Viewport / theme   | 1280 × 800 CSS pixels; light/blue/comfortable                                   |
| Throttling / cache | No throttling; assets loaded before timing; document work offline               |
| Timings            | 3 warmups then 20 samples per fixture/operation                                 |
| Loaded memory      | 10 baseline/loaded pairs per fixture                                            |
| Replacements       | 100 cycles per fixture; GC checkpoints every 10 cycles                          |
| Idle control       | 100 cycles without replacing documents                                          |
| Extended profile   | 500 small-document cycles; snapshots at 0/100/300/500; 100 large-document edits |

Median averages the middle pair; p95 uses nearest rank `ceil(0.95 × n)`. All measured samples are retained. Values of 0.00 ms are below clock resolution, not zero work. Each stage's percentile is computed independently; percentiles should not be added together.

The isolated production harness imports the same file reader, validator, store and `DocumentView` as the app. Initial mounting is timed after unmounting the previous view. Load includes `File.arrayBuffer()`, strict decoding, duplicate-property scanning, parsing, resource preflight, schema and semantic validation. File construction, automation transport and OS file-picker/physical-disk latency are excluded.

The actual production app is measured separately through its normal file-change and input handlers. A cell-update observation requires both chart summaries and SVG geometry to change. DOM completion uses a mutation observer. **Paint opportunity** adds two animation-frame callbacks for style/layout and a paint opportunity between them; it is not a GPU presentation timestamp. This adds a frame-sized floor and observer overhead, so these numbers are not pure CPU work or human typing latency. Forced GC and profiling are outside the normal timing samples.

## Valid synthetic fixtures

| Fixture | UTF-8 bytes | Nodes | Markdown nodes | Rows × columns |  Cells | Points per chart | Initial table rows |
| ------- | ----------: | ----: | -------------: | -------------: | -----: | ---------------: | -----------------: |
| Small   |       3,072 |    14 |              1 |          3 × 3 |      9 |                3 |                  3 |
| Medium  |     102,400 |   300 |             15 |        250 × 3 |    750 |              250 |                100 |
| Large   |   1,048,576 | 2,000 |            100 |     1,000 × 20 | 20,000 |              500 |                100 |

Each fixture has one dataset, a bar and line chart, editable numeric cells, saved state controls, visible conditional content, a card and Unicode Markdown. Depth is 3. Repeated visible text fills exact byte budgets; full parsing/validation verifies all caps before timing. Large reaches 2,000 nodes, 1,000 dataset rows, 20,000 cells and 500 points per chart; later chart values are null. These fixtures do not cover every valid or hostile worst case.

## Loading, rendering and edits

Pairs are **median / p95 milliseconds**.

| Operation                                            |         Small |        Medium |         Large |
| ---------------------------------------------------- | ------------: | ------------: | ------------: |
| Read/decode/duplicate scan/parse                     |   0.60 / 0.80 |   0.65 / 0.80 |   4.00 / 4.60 |
| Preflight/schema/semantic validation                 |   0.40 / 0.50 |   0.90 / 1.10 |   4.05 / 5.10 |
| Combined read through validation                     |   1.00 / 1.20 |   1.50 / 1.80 |   8.10 / 9.40 |
| Store construction                                   |   0.00 / 0.10 |   0.00 / 0.10 |   0.10 / 0.20 |
| Validated document → initial render, including store | 32.15 / 33.40 | 31.60 / 32.40 | 60.05 / 61.30 |
| Actual viewer open → new document DOM                |   2.20 / 2.90 |   6.00 / 6.50 | 20.55 / 29.10 |
| Actual viewer open → paint opportunity               | 31.10 / 32.30 | 32.55 / 33.30 | 71.00 / 78.70 |
| Cell edit → both charts' DOM                         |   1.50 / 2.00 |   1.90 / 2.30 |   3.40 / 3.60 |
| Cell edit → paint opportunity                        | 31.05 / 33.00 | 32.05 / 33.00 | 32.00 / 32.50 |
| Show 100 more rows → DOM                             |           n/a |   4.30 / 4.80 |  9.75 / 11.00 |
| Show 100 more rows → paint opportunity               |           n/a | 30.50 / 31.20 | 23.90 / 26.50 |

The renderer now reuses unchanged mounted Markdown on cell/state edits. Medium/large cell-to-chart DOM medians fell from **3.25 → 1.90 ms** and **6.00 → 3.40 ms**, respectively. The CPU profile's Markdown processing samples disappeared from the edit path. Initial loading and two-frame timings remain broadly unchanged; no faster-frame or general loading improvement is claimed.

Progressive tables initially mount at most 100 rows. The next-row measurement verifies exactly another 100 appear; edits are measured after restoring the initial row batch. Frame alignment explains why large next-row paint-opportunity time can be lower despite higher DOM work.

## Replacements and memory

There is no Close command in v0.1. Each cycle opens a fixture and replaces it with a minimal valid empty-column document, exercising release of the old store and rendered tree. There are **300 measured cycles / 600 opens** across the three fixtures after warmups. Pairs below are paint-opportunity **median / p95 milliseconds**.

| Fixture |  Open fixture | Replace with baseline |
| ------- | ------------: | --------------------: |
| Small   | 31.10 / 32.10 |         31.40 / 32.60 |
| Medium  | 32.50 / 33.50 |         30.90 / 31.80 |
| Large   | 67.90 / 76.10 |         28.40 / 32.30 |

Loaded memory values are **median / p95 MiB**, with baseline showing median only. JS and embedder heap are distinct CDP measurements, not total process RSS, and are not added together to claim total memory. Values include app code, React, the fixed measurement observer/File corpus and warmed caches. They are not isolated document sizes or peak-memory measurements.

| Fixture | Baseline JS after GC | Loaded JS before GC | Loaded JS after GC | Loaded embedder heap after GC |
| ------- | -------------------: | ------------------: | -----------------: | ----------------------------: |
| Small   |                5.787 |       6.107 / 6.158 |      5.851 / 5.882 |                 0.905 / 0.908 |
| Medium  |                6.120 |       8.078 / 8.178 |      6.986 / 7.027 |                 5.234 / 5.237 |
| Large   |                6.477 |     10.747 / 14.029 |      9.026 / 9.042 |               22.876 / 22.885 |

The separate render harness is closed before memory sampling. Experiments run small → medium → large in one browser session; baseline differences include cache/warmup history. Snapshots also record heap capacity, backing storage, DOM counts and listeners. The idle control uses the same automation/settling/GC cadence without opens; it is not subtracted from the application results.

| Experiment   | JS heap start → end, MiB | Change, KiB | Bytes/cycle slope, all / cycles 50–100 |
| ------------ | -----------------------: | ----------: | -------------------------------------: |
| Small        |            6.074 → 6.214 |     +143.77 |                          +1466 / +1938 |
| Medium       |            6.323 → 6.431 |     +110.17 |                           +1226 / +832 |
| Large        |            6.628 → 7.269 |     +656.07 |                           +3190 / -108 |
| Idle Control |            7.269 → 7.272 |       +3.09 |                              +14 / +45 |

Every baseline checkpoint returns to **1 document, 68 DOM nodes, 36 elements and 178 JS event listeners**, with no table/chart content. Small/medium JS heap still drifts above idle; most large growth occurs early and its late slope is near flat. The extended 500-cycle snapshots identify most JS growth as V8 code/warmup structures, with no net ordinary-object/closure group growth in the observed late interval. Native media-query structures continue accumulating under `StyleEngine → HTMLDocument`; see [the detailed investigation](performance-improvements.md#memory-investigation-and-disposition).

**The no-persistent-memory-growth target remains unconfirmed.** Neither stable DOM counters nor snapshot group counts prove leak freedom. No memory improvement is attributed to the Markdown rendering change. This limitation must remain visible in release notes.

## Production bundle and budgets

The 2026-11-19 emitted assets were independently compressed with Node zlib **gzip level 6**. All JS chunks are conservatively counted, including any future lazy chunks; the current app emits one JS and one CSS file. The benchmark harness is excluded.

| Asset      | Minified bytes | Gzip bytes | Gzip KiB |
| ---------- | -------------: | ---------: | -------: |
| JavaScript |        513,366 |    154,213 |   150.60 |
| CSS        |         10,381 |      3,060 |     2.99 |

Vite separately reports **513.36 kB / 155.82 kB gzip** for JS and **10.38 kB / 3.07 kB gzip** for CSS. Compressor implementation and decimal/binary units differ. Both JS gzip measurements fit the target. That build emitted a **500 kB uncompressed chunk warning**; it is not the 250 KiB gzip budget.

| Specification target                                    | Current measurement                                  | Status      |
| ------------------------------------------------------- | ---------------------------------------------------- | ----------- |
| Reference demo <10 KiB                                  | 2,543 bytes / 2.48 KiB                               | Met         |
| Initial JS aim ≤250 KiB gzip                            | 150.60 KiB, all emitted JS counted                   | Met         |
| 1 MiB read/decode/parse/validate median ≤200 ms         | 8.10 ms                                              | Met         |
| 300-node initial render after validation median ≤500 ms | 31.60 ms, including store creation                   | Met         |
| Edited cell → affected chart median ≤100 ms             | Slowest fixture median 32.05 ms; both charts checked | Met         |
| Local-document network requests =0                      | 0 attempted requests while offline                   | Met         |
| 100 cycles: no persistent memory growth after GC        | JS warmup identified; native retention persists      | Unconfirmed |

Recorded 2026-11-19 JavaScript SHA-256: `5f8602e443897a9617d239c6ca5d9bd0330875e22917715b2a460a1c90523bb4`. The lockfile SHA-256 is `52abb0620a3a698a393ee8ce85bbc215a46d1999fa5d1c76c3c4eb203a56502e`. These bind the recorded measurements to the tested build/dependency set.

## Strict-CSP bundle follow-up — 2026-11-20

Build-time Ajv compilation removes the schema compiler from the shipped application. Using the same Node zlib gzip level 6 measurement, the resulting assets are:

| Asset      | Minified bytes | Gzip bytes | Gzip KiB |
| ---------- | -------------: | ---------: | -------: |
| JavaScript |        450,314 |    122,830 |   119.95 |
| CSS        |         10,381 |      3,060 |     2.99 |

JavaScript gzip falls by **31,383 bytes (20.35%)**, from 150.60 to 119.95 KiB. Vite reports 450.31 kB raw / 123.94 kB gzip for JavaScript; the 500 kB chunk warning no longer occurs. CSS is unchanged. This is a measured bundle reduction; loading and editing have not been rebenchmarked for this change. Current-build replacement memory is measured separately in the [memory follow-up](memory-stability.md).

JavaScript SHA-256: `0c555579d6eece551ec3c9507ac82f5bfe1235a23f97e09229b68708605e2257`. Lockfile SHA-256: `54149516e1f5dd7e65be5c36718c3c7ebde2e8f7931226b77323bf718d7ce8ba`. Ajv moved to development dependencies; package versions, integrity hashes and resolutions are unchanged. See the [strict-CSP verification](release-readiness.md#strict-csp-follow-up--2026-11-20).

The subsequent [development-dependency upgrade](release-readiness.md#development-dependency-follow-up--2026-11-20) changed the lockfile SHA-256 to `9ea1bb03381da85abc99b1618126afb66bb8c89d7b674d0f82e9c3c4b426065e`. A fresh install/build produced a byte-identical generated validator and JS/CSS assets, so the strict-CSP bundle sizes and asset hashes above still apply. This dependency-only update adds no new timing or memory measurements.

## Scope and release interpretation

The optimized benchmark and profile completed with zero page exceptions and zero document-related request attempts. The [release-readiness report](release-readiness.md) records fresh-checkout validation, the browser suite and the current dependency audit. The original documentation review reused measurements after verifying matching hashes. The later strict-CSP build has different JavaScript and lockfile hashes; loading/edit timing measurements have not been rerun for that build. The [memory follow-up](memory-stability.md) records new replacement runs in Chromium 159, Chromium 157 and WebKit 27.2.

Unmeasured areas include cold startup, physical disk latency, a 5 MiB maximum-size workload, adversarial Markdown CPU time, many simultaneous charts, a fully expanded 1,000-row editable table, total process/GPU peak memory, Firefox performance, WebKit loading/edit performance and physical mobile devices. Battery/thermal conditions and unrelated OS activity were not controlled. Results from this fast reference machine are not universal guarantees. The functional Definition of Done does not turn an unconfirmed engineering memory target into a pass.
