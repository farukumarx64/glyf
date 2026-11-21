# Bun package-management migration

Completed **2026-11-21**, from the working tree based on `158b307`. Bun **1.3.14** manages dependency installation and package scripts. Node **22.18.0** remains the locally tested runtime for Vite, Vitest, Playwright and the existing TypeScript tooling. This is a tooling change; the document contract and viewer implementation are unchanged.

## Lockfile and dependency preservation

The original manifest, npm lockfile and asset fingerprints were saved before migration. `bun install --lockfile-only --ignore-scripts` imported the existing npm v3 lockfile using Bun's [documented migration support](https://bun.sh/docs/pm/lockfile). After reviewing install scripts, the lockfile was regenerated with the explicit esbuild trust policy.

All **341 package records** preserve their package names, versions, integrity hashes, dependency requirements, optional-dependency requirements and peer-dependency requirements. Direct runtime/development versions are unchanged. Bun nests `json-schema-traverse@0.4.1` under ESLint's Ajv rather than directly under ESLint; its version and content integrity are unchanged. Registry packages retain their npm registry source; Bun represents the default source implicitly.

A clean temporary snapshot, without `node_modules`, the generated validator, `.npmrc` or `package-lock.json`, passed `bun install --frozen-lockfile`. It installed **285 platform-applicable packages** on macOS arm64. The larger lockfile inventory includes optional packages for other platforms. The frozen installation did not change `bun.lock`. A deliberately mismatched React requirement failed with a frozen-lockfile error and also left the lockfile unchanged.

After verification, `package-lock.json` was removed. `bun.lock` is the single authoritative lockfile and is excluded from Prettier so Bun owns its formatting. Its SHA-256 is:

```text
42ed27a9565acc55f91666f9a2873878aa75694c57e1f323c5fe1ee4fedb715b
```

## Installation policy and runtime boundaries

- `package.json` pins `packageManager` to `bun@1.3.14` and declares the same exact Bun engine. The Node engine range and `.nvmrc` are retained.
- `bunfig.toml` replaces `.npmrc`'s exact-save setting with `install.exact = true`. `run.bun = false` keeps Node executable invocations and shebangs on Node.
- An isolated probe confirmed that Bun 1.3.14 accepts impossible engine ranges despite npm's `engine-strict=true`. The dependency-free root `preinstall` script, `scripts/check-toolchain.mjs`, therefore reads the manifest, checks Bun's actual version, locates Node on PATH and checks its version using Bun's built-in semver API. It reports actionable errors for a wrong Bun version, unsupported Node or missing Node. It can run before project dependencies exist. Keep install scripts enabled; intentionally bypassing lifecycle scripts also bypasses this guard.
- `trustedDependencies` explicitly allows only **esbuild**, whose postinstall prepares/verifies its platform binary. The locked fsevents package includes its native binary and has no required install hook. The fresh installation reported **zero untrusted dependencies with scripts**. The explicit list follows Bun's [lifecycle-script policy](https://bun.sh/docs/pm/lifecycle); review new lifecycle requirements individually when dependencies change.
- No package was upgraded or added. Vite remains the bundler, Vitest the test runner, and Playwright the browser harness. Use `bun run test`; `bun test` is a different runner. Node-based scripts still use `node --import tsx`.

## Commands and documentation

Nested npm invocations in package scripts and the Playwright preview-server command now use Bun. Arguments follow the script name directly, for example `bun run test tests/store.test.ts` or `bun run memory investigation chromium 1000`. `bun run playwright` selects the installed, pinned CLI without an on-demand download.

Benchmark and memory reports now name and hash `bun.lock`. Profiling/memory usage messages and the generated validator's header describe the new commands. Current README, working-specification and report reproduction instructions were updated. Dated npm verification results and the supplied reference specification remain historical evidence. The release checklist marks P01 complete; no CI workflow or release artifact was added.

For a fresh checkout with Bun 1.3.14 and supported Node on PATH:

```sh
bun install --frozen-lockfile
bun run check
bun run playwright install --only-shell chromium webkit
bun run test:viewer
bun run dev
```

For intentional dependency changes, use `bun add <package>@<version>` or `bun add --dev <package>@<version>` and review both manifest and lockfile. Stop running tools before replacing an existing npm-installed `node_modules` directory with a fresh frozen Bun installation. If a frozen install fails, resolve the manifest/lockfile mismatch deliberately; do not remove the lockfile to get an arbitrary new graph.

## Verification

Environment: Apple M4, macOS **27.2.1**, arm64; Bun **1.3.14** (`d1632b29`), Node **22.18.0**; Playwright **1.65.1**, Chromium **159.0.8154.6** and WebKit **27.2**.

| Check                                       | Result                                                                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clean `bun install --frozen-lockfile`       | Passed; 285 installed packages, unchanged lockfile, toolchain guard and esbuild setup succeeded.                                                                                                                                                 |
| Deliberate manifest/lockfile drift          | Rejected; frozen lockfile unchanged.                                                                                                                                                                                                             |
| Isolated toolchain probes                   | Supported environment accepted; wrong Bun pin, incompatible Bun engine, unsupported Node and missing Node rejected.                                                                                                                              |
| `bun run check` in the clean snapshot       | Passed strict TypeScript, zero-warning ESLint, formatting, **609 tests across 30 files**, full reference-demo validation and production build. Existing format round trips, hostile-input tests and validator equivalence tests remain included. |
| `bun run test:viewer`                       | **68/68 passed** across Chromium/WebKit. Includes strict-CSP startup, offline workflows, cell/state editing, download/reopen, errors, safe Markdown and automated accessibility assertions.                                                      |
| `bun run dev --port 5182 --strictPort`      | Started successfully; headless Chromium opened the demo, edited state, hid the conditional chart and checked 375px layout without page errors or page overflow. Server stopped after verification.                                               |
| `bun run benchmark`                         | Completed all existing fixture/timing/memory/replacement workloads. Report identifies and hashes `bun.lock`; no browser exceptions or document-related request attempts. Run in the temporary snapshot to preserve earlier local measurements.   |
| `bun run memory bun-migration chromium 100` | Completed idle, small and large workloads at 100 cycles each; correct Bun lockfile fingerprint, zero browser exceptions and request attempts. Confirms runner compatibility, not long-term memory stability.                                     |
| `bun audit --json`                          | Exit 0, empty advisory object: **zero known advisories** across the full dependency graph, including development dependencies.                                                                                                                   |

The audit covers the full graph; a separate production-only Bun audit is not claimed. Advisory results reflect the registry at verification time. Browser binaries were already installed on this machine; first-time browser downloads were not repeated.

The generated validator differs only in its header (`npm run` → `bun run`); its executable code is identical. The production assets are byte-identical to the pre-migration build:

| Asset                |   Bytes | SHA-256                                                            |
| -------------------- | ------: | ------------------------------------------------------------------ |
| `index-BYemfUO1.js`  | 450,314 | `0c555579d6eece551ec3c9507ac82f5bfe1235a23f97e09229b68708605e2257` |
| `index-dT19BO2g.css` |  10,381 | `8220d45e9710f161fa7c62f0320ea4ef7251eec9ad2231ef9ae4d8d69336524a` |

JavaScript remains **122,830 bytes gzip (119.95 KiB)** with the benchmark runner's gzip level 6. The schema, reference demo and supplied reference files are unchanged. Migration evidence is retained locally in ignored `benchmark-results/bun-migration/`; it includes lock comparison, negative probes, check logs, fingerprints and runner results.

This verifies installation on macOS arm64 and existing automated browser behavior. Fresh Linux/Windows installations, alternate Node versions and native screen-reader/file-dialog workflows are not certified by this run. The command checks do not establish a package-manager speed improvement or resolve the existing memory-stability question. Outstanding public naming, extension and manual verification gates remain in [release readiness](release-readiness.md).
