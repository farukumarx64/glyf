# Replacement memory follow-up — 2026-11-20

**Historical verification record:** Names, measurements and counts below describe the builds recorded at the time. The current rc.3 format uses the `glyf` marker, `.glyf` files and Glyf APIs; see [the current contract](compatibility.md#glyf-name-and-file-extension). These results are not new rc.3 measurements.

The longer runs reproduce native media-query retention in two Chromium versions. They do not show an accumulating history of Mosaic documents or removed document views. The §7 no-persistent-growth target remains unconfirmed; a flat DOM count is not a leak-free result. The final investigation and disposition are recorded below.

## Build and measurement method

The measured application is commit `06c4e86` plus measurement-only scripts. Application code, the schema, dependencies and the generated production assets are unchanged. JavaScript SHA-256 is `0c555579d6eece551ec3c9507ac82f5bfe1235a23f97e09229b68708605e2257`; CSS is `8220d45e9710f161fa7c62f0320ea4ef7251eec9ad2231ef9ae4d8d69336524a`. Lockfile SHA-256 is `9ea1bb03381da85abc99b1618126afb66bb8c89d7b674d0f82e9c3c4b426065e`. These are the current strict-CSP/dependency-upgrade assets, so these memory results supersede the older build's replacement evidence without relabeling its loading/edit timings.

Reference machine: Apple M4, 16 GiB RAM, Darwin 27.2.0 arm64, Node 22.18.0. No CPU/network throttling. Viewport 1280 × 800, light system appearance. The profiles are Playwright Chromium **159.0.8154.6**, installed Brave with Chromium **157.0.8103.39**, and Playwright WebKit **27.2**. Brave uses a fresh temporary automation profile, not the user's profile. Browser distribution/flags differ, so this is not an isolated version-only causal experiment or branded Safari certification.

The [runner](../scripts/memory.ts) executes idle, small and large workloads serially, each in a fresh browser process. Each workload has ten warmups and 1,000 measured cycles. A replacement cycle opens the fixture through the real file-input handler, waits for the replacement and two animation frames, then opens a minimal valid baseline and settles again. The idle control uses the same frame waits without replacements. Assets load before the context goes offline; request attempts and page errors are recorded and must remain zero.

Fixtures reuse the deterministic generator: **3 KiB / 14 nodes / 3 rows** and **1 MiB / 2,000 nodes / 1,000 rows / 20,000 cells**, with Markdown, state controls, conditional content, an editable table and two SVG charts. The large table initially renders 100 rows; charts each plot 500 non-null points. The medium workload already has historical measurements; this follow-up brackets it with small and large workloads rather than claiming a new medium result.

Checkpoints request GC every 100 cycles, including the midpoint and end. The measurement-only observer wraps `JSON.parse` without changing its result and keeps weak references to parsed fixture documents and rendered view roots. It is installed after the fixed File/title corpus is prepared; dead references are pruned at checkpoints. It counts every expected fixture parse/view and asserts baseline visible DOM counts. It never exposes a testing API in the shipped application.

Chromium additionally records CDP JavaScript/embedder usage, DOM/listener counts and raw heap snapshots at 0, 500 and 1,000. WebKit lacks those CDP measurements; unavailable fields are `null`, not zero. [Playwright's GC request](https://playwright.dev/docs/api/class-page#page-request-gc) is best-effort, so weak-reference survival is evidence to inspect, not by itself proof of a leak.

## Chromium results

JavaScript heap values are bytes after requested GC. Late slopes are least-squares fits to checkpoints 500–1,000, in bytes per cycle; they are descriptive measurements, not CI thresholds.

| Browser              | Workload |   JS at 0 | JS at 500 | JS at 1,000 | Late slope | Native MediaQuerySet at 0 → 500 → 1,000 |
| -------------------- | -------- | --------: | --------: | ----------: | ---------: | --------------------------------------- |
| Chromium 159         | Idle     | 3,058,292 | 3,070,208 |   3,070,680 |       −4.4 | 3 → 3 → 3                               |
| Chromium 159         | Small    | 4,512,756 | 5,434,800 |   5,523,080 |      127.7 | 14 → 514 → 1,014                        |
| Chromium 159         | Large    | 6,082,884 | 6,521,816 |   6,600,604 |      105.8 | 14 → 514 → 1,014                        |
| Brave / Chromium 157 | Idle     | 3,396,340 | 3,408,396 |   3,408,916 |       −4.6 | 4 → 4 → 4                               |
| Brave / Chromium 157 | Small    | 4,918,584 | 5,888,832 |   5,983,092 |      139.7 | 15 → 515 → 1,015                        |
| Brave / Chromium 157 | Large    | 6,495,484 | 7,042,872 |   7,087,668 |       79.7 | 15 → 515 → 1,015                        |

Native media-query structures grow by one set, one query and one feature-expression node per fixture cycle in both Chromium versions, independent of fixture size. Their combined snapshot self-size increases **136,000 bytes per 1,000 cycles**, excluding backing tables, allocator overhead and dominated objects. This is not a total retained-size estimate and it does not plateau within these runs.

Most late JavaScript growth remains compiled-code related. From 500 to 1,000 cycles, Chromium 159's small/large code groups grow 68,032 / 65,900 bytes while ordinary object counts change by only +2 / +2 and closure counts remain unchanged. Chromium 157's corresponding code changes are 60,148 / 39,572 bytes, ordinary objects +2 / +4, and closures unchanged. These are group comparisons, not a complete ownership proof.

## Object lifetimes and WebKit results

The nine completed workloads contain **6,000 measured fixture-to-baseline cycles** (12,000 file replacements), plus **3,000 idle cycles**, excluding warmups. Every workload completed with zero page errors and zero post-load request attempts. Every checkpoint returned to 37 visible elements, with no rendered table rows or chart points. Chromium also returned to one document, 71 DOM nodes and 179 JavaScript listeners throughout.

| Browser              | Small: live parsed documents / removed views at end | Large: live parsed documents / removed views at end | Observation across checkpoints                                                                                   |
| -------------------- | --------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Chromium 159         | 1 / 0                                               | 1 / 0                                               | Exactly one previous fixture document; no retained removed views                                                 |
| Brave / Chromium 157 | 1 / 0                                               | 1 / 0                                               | Same bounded pattern                                                                                             |
| WebKit 27.2          | 1 / 0                                               | 1 / 0                                               | Exactly one previous document; sometimes one view survives a GC request, then is collected at a later checkpoint |

All idle weak-reference counts are zero. In each replacement workload, the observer saw exactly 1,010 fixture parses and 1,010 views including ten warmups, so flat live counts are not caused by failing to observe replacements. WebKit's occasional surviving view is retained in the evidence; there was no accumulation of views. Its results support bounded object lifetimes within this run, not a native-memory plateau.

A Chromium heap retainer path for the remaining parsed document runs through the live React root, a fiber's `memoizedState`, the opened store and its closure context. This is distinct from the native browser retention. In separate 100-cycle checks in Chromium 159 and WebKit 27.2, opening the empty baseline a second time and requesting GC reduced watched documents from **1 to 0**, with views still zero. That confirms a bounded previous state snapshot rather than an ever-growing application document history. To repeat this diagnostic, use the same observer after a fixture/baseline sequence, open baseline again, settle and request GC before reading weak counts.

## Native retention isolation and disposition

Production probes first removed CSS, charts, focus calls or Markdown without removing the growth. Removing all table/input/toggle nodes stopped the per-cycle increase. Further 100-cycle variants isolated the source: input-only **3 → 3**, toggle-only **3 → 3**, table-only **3 → 103** native media-query sets in Chromium 159.

The checked-in [standalone native probe](../scripts/memory-native.ts) then reproduced the pattern without loading Mosaic, React, application CSS or application event handlers. It appends a plain HTML element, forces layout, waits a frame, removes the element and waits another frame, 100 times. Each case uses a fresh browser process. Both Chromium versions produced the same result:

| Standalone case                | Chromium 159 MediaQuerySet before → after | Chromium 157 MediaQuerySet before → after |
| ------------------------------ | ----------------------------------------- | ----------------------------------------- |
| Plain div                      | 0 → 0                                     | 0 → 0                                     |
| Table with header and one cell | 0 → 100                                   | 0 → 100                                   |
| Same table with caption        | 0 → 100                                   | 0 → 100                                   |

After each standalone case, DOM counters returned to **one document, six nodes and zero event listeners**. There were zero page exceptions and request attempts. Each table also leaves one corresponding native query and feature-expression node per cycle, matching the production signature. Captions are not required for reproduction.

Both the application and standalone table snapshots show the native retaining path `HTMLDocument → StyleEngine → HeapHashTableBacking<…MediaQuerySet…> → MediaQuerySet`. In the separate Chromium 159 diagnostic, an extra baseline replacement released the previous parsed document but left native sets at **104**; changing emulated system appearance to dark reduced them to **4**. This supports a style-engine cache/invalidation explanation and separates it from document ownership. Appearance changes are a diagnostic only, not an application workaround. This is browser-owned retention that can be triggered by ordinary semantic HTML tables. The experiment establishes that Mosaic and React are not necessary to reproduce it; it does not establish an upstream issue number, affected-version range beyond the tested versions, or a browser fix date.

**No application memory fix is justified by these measurements.** Keep semantic tables, labels, focus and rendering behavior intact. Do not add document resets, global caches, forced appearance changes or manual cleanup for objects owned by the browser. No runtime code, dependency, format rule or resource limit changed in this follow-up.

**R1 remains unconfirmed**, because native growth is still measurable and WebKit native visibility is incomplete. The reproducible standalone case is ready for an upstream browser investigation; no external issue was submitted. Recheck it on later browser builds before strengthening the release claim. A future accumulating document/view/store path would warrant an application fix and a focused regression; that pattern was not observed here.

## Process-memory limits

The runner also records `ps` resident memory for the launched browser PID and its descendants. The accounting helper converts KiB to bytes, handles out-of-order descendants and excludes unrelated processes; dedicated tests cover those boundaries. Summed RSS can double-count shared pages and is not private memory or a peak-memory measurement.

Chromium process-tree RSS fluctuates substantially, including after heap-snapshot capture even in the idle control. Sampling immediately before snapshots avoids charging that snapshot to the same checkpoint, but earlier snapshot allocation/residency still affects later readings. Do not interpret an RSS regression slope as a retained-object leak rate.

On macOS, WebKit's WebContent/GPU/network XPC services are parented to launchd rather than the launched browser. The runner's PID subtree therefore measures the browser UI process and **omits those services**. Its WebKit RSS is explicitly incomplete and cannot establish renderer/native memory stability. No equivalent CDP heap or native-object count was fabricated.

## Evidence and reproduction

Run one browser workload at a time on macOS or Linux, after installing the selected Playwright browser. Choose a fresh label; the runner refuses to overwrite earlier results.

```sh
bun run memory chromium-159 chromium 1000
bun run memory brave-157 chromium 1000 "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
bun run memory webkit-27 webkit 1000
```

The native-only comparison needs no app server or production build:

```sh
bun run memory:native chromium-159 100
bun run memory:native brave-157 100 "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
```

It writes summaries and before/after snapshots to `benchmark-results/memory-native-<label>/`, using fresh labels and 100–5,000 iterations. The fixed HTML and create/layout/remove loop are in the script, so the reproduction does not depend on ignored diagnostic files.

The optional executable argument is Chromium-only and depends on a locally installed browser. Port **4178** serves the production build on loopback. Supported cycle counts are 100–5,000 in multiples of 100. Results include exact browser versions, build/lock/fixture hashes, hardware, workload metadata, all checkpoints, selected process names, raw Chromium snapshots, page errors and network attempts in ignored `benchmark-results/memory-<label>/` directories. Local diagnostic evidence is retained under `benchmark-results/memory-follow-up/`.

These are finite desktop experiments, not guarantees for all browsers or devices. They do not cover Firefox, physical mobile devices, maximum 5 MiB inputs, fully expanded large tables, prolonged editing/download loops, browser extensions or cold startup. No new format features, application dependencies or runtime measurement code are introduced.

## Verification

`npm run check` passed strict TypeScript, zero-warning lint, formatting, **609 tests in 30 files**, full reference-demo validation and the production build. Two new tests verify the process-memory accounting boundaries. The production Chromium/WebKit suite passed **68/68** tests, including strict CSP and complete offline workflows. Both standalone native comparisons completed with zero page errors and requests. Production JS/CSS hashes match the build recorded above; no measurement code enters the shipped bundle.
