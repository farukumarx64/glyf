# Pre-release candidate preparation

Prepared **2026-11-22**. App **`0.1.0-rc.3`** is a local evaluation candidate. The document format remains **`0.1.0`**, the required marker is `"glyf": "0.1.0"` and extension is `.glyf` (pre-rename documents are rejected), and `package.json` remains private. The [draft release notes](releases/0.1.0-rc.3.md) describe the included behavior and limitations. Packaging does not publish, tag, push or deploy a release.

## Build and verify

Use **Node 22.18.0** from `.nvmrc` and **Bun 1.3.14** from `package.json`. Candidate packaging enforces these exact versions; ordinary development still accepts the wider Node engine range. Start from a fresh checkout with unchanged input bytes and run:

```sh
bun install --frozen-lockfile
CI=true bun run check
bun run playwright install --with-deps --only-shell chromium webkit
CI=true bun run playwright test
bun run release:prepare
```

Browser installation needs network access and, on Linux, permission to install system prerequisites. Skip installation when the pinned browsers are already available. `release:prepare` regenerates the validator, typechecks and rebuilds the production viewer before packaging; it does **not** replace the full lint/test/browser checks above. It rejects `.env`/`.env.*` files and `VITE_*` environment overrides so local configuration is not silently incorporated. No new package dependency is required.

The output directory is **`release/0.1.0-rc.3/`**, ignored by Git, lint and formatting:

| File                                   | Purpose                                                                                                                                  |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `glyf-viewer-0.1.0-rc.3.tar.gz`        | Static viewer and evaluation materials in one versioned directory.                                                                       |
| `glyf-viewer-0.1.0-rc.3.manifest.json` | Readable app/format/toolchain versions, source and lockfile digests, payload sizes and SHA-256 hashes; also included inside the archive. |
| `SHA256SUMS`                           | SHA-256 of the archive and adjacent manifest.                                                                                            |

Repeated preparation replaces only these generated files for this version. It leaves other version directories intact. The script always rebuilds `dist/`, so an old production build is not reused as a candidate. Changing included source or release-note bytes changes the source fingerprint and archive checksum; preserve reviewed artifacts and increment the candidate version for a new externally shared candidate.

The archive contains `site/`, package instructions, draft release notes, the current Glyf demo and schema, dependency notices, `SOURCE-FILES.json`, `manifest.json` and internal `SHA256SUMS`. Vite generates notices for the bundled app dependencies; Ajv's license is included separately because its helper is embedded during standalone-validator generation. Source code, `node_modules`, test evidence, environment files and Git metadata are excluded.

The [package README](release-package.md) explains outer/inner checksum verification, extraction, local serving, HTTP(S) hosting, the tested CSP, caching and a first edit/download/reopen workflow. Host only `site/` at an origin root; the unchanged candidate does not support a subdirectory mount or `file://`. The archive does not configure server headers itself.

## Reproduce the bytes

Use two fresh checkouts of the **same committed candidate source**, with identical line endings, exact Node/Bun versions and the frozen lockfile. In each, run `bun install --frozen-lockfile` and `bun run release:prepare`. Compare all three output files with `cmp` or their SHA-256 values. For example, with checkouts at `/tmp/glyf-rc-a` and `/tmp/glyf-rc-b`:

```sh
cmp /tmp/glyf-rc-a/release/0.1.0-rc.3/glyf-viewer-0.1.0-rc.3.tar.gz /tmp/glyf-rc-b/release/0.1.0-rc.3/glyf-viewer-0.1.0-rc.3.tar.gz
cmp /tmp/glyf-rc-a/release/0.1.0-rc.3/glyf-viewer-0.1.0-rc.3.manifest.json /tmp/glyf-rc-b/release/0.1.0-rc.3/glyf-viewer-0.1.0-rc.3.manifest.json
cmp /tmp/glyf-rc-a/release/0.1.0-rc.3/SHA256SUMS /tmp/glyf-rc-b/release/0.1.0-rc.3/SHA256SUMS
```

These paths are examples; do not compare against an older committed checkout while candidate changes are still uncommitted. If bytes differ, first compare `SOURCE-FILES.json` and the toolchain/lockfile fields before examining asset hashes.

The packager sorts archive paths without locale-dependent comparison, permits only regular files, rejects unsafe/duplicate/overlong member names, and fixes permissions to `0644`, uid/gid to zero and timestamps to the Unix epoch. It emits a regular-file-only ustar archive and gzip level 9 with no timestamp, source filename or host OS identifier. It uses Node built-ins instead of platform-specific archive creation flags. The archive is a distribution mechanism for the viewer, not a change to the JSON document format.

The manifest fingerprints explicitly selected source/configuration/package inputs: `src/` except the generated validator, `scripts/`, package/toolchain/build configuration, schema, demo and the two packaged documentation files. The generated validator is rebuilt from source. Inputs do not include test evidence, this verification report, general repository documentation or Git history. This avoids a circular dependency between the recorded archive hash and the archive itself. The input list and lockfile digest identify reproducible content; they do not assert a signed source revision or supply the source code.

## rc.3 verification — 2026-11-22

The reviewed tree is based on `c83b5b5` plus the owner-approved complete Glyf rename, before committing these changes. The toolchain is Node **22.18.0**, Bun **1.3.14**, Chromium **159.0.8154.6** and WebKit **27.2**, on macOS arm64.

- `CI=true bun run check` passed typecheck, lint, formatting, **626 tests across 32 files**, current-demo validation and the production build. The schema-difference test permits only the existing D003 column restriction and the approved identity changes. Old and mixed markers are rejected across source/direct-validation/serialization boundaries; failed checks preserve input values.
- The rename exposed a hard-coded benchmark filler length. The generator now uses the actual ASCII string length; existing tests again verify exact 3 KiB, 100 KiB and 1 MiB fixtures. This is a fixture correction, not a new performance measurement.
- Two fresh snapshots, initially without dependencies/generated validator/`dist/`, each installed 285 platform-applicable packages from the frozen lockfile. Both and the main checkout produced identical archive, adjacent manifest and outer checksums. Dependency versions/resolutions did not change.
- Verified all 12 regular-file archive members, fixed metadata, internal checksums, and 67 source-input fingerprints. The packaged schema/demo equal the current working inputs. The manifest explicitly records `documentVersionField: "glyf"` and `documentExtension: ".glyf"`, alongside document version `0.1.0`.
- **70/70 production-browser checks passed** against the extracted archive's site, with no rebuild, in **58.0 seconds**. Both engines rejected the archived original under `.mosa` and `.glyf` filenames, focused the `/glyf` error, preserved the current edits and downloaded/reopened valid Glyf JSON offline. Existing strict-CSP, keyboard, editing, conditions, unsaved-change, resource-limit, safe-Markdown and error-recovery workflows passed using the renamed renderer identifiers. The 320 px start screen was checked for overflow and its WebKit screenshot was visually inspected.
- The converted light/dark manual fixtures validate; the intentionally malformed fixture still returns `INVALID_JSON`. The three supplied originals and prior rc.1/rc.2 archives retain their bytes. The current demo differs from the supplied original only in its version-field name and two display strings.
- Checked 226 local documentation file links and 51 local heading anchors. Current docs describe the intentional pre-adoption break; earlier notes and performance evidence are labeled historical. There are no active `.mosa` fixtures and no old API aliases.

| Artifact                               |   Bytes | SHA-256                                                            |
| -------------------------------------- | ------: | ------------------------------------------------------------------ |
| `glyf-viewer-0.1.0-rc.3.tar.gz`        | 141,281 | `5495c9711e92d9030567f4e8b5d72d89fcc4669955bbb1534c66ec242f4d3451` |
| `glyf-viewer-0.1.0-rc.3.manifest.json` |   1,974 | `2bd729b3c2d993ce40520bff5247e3a65fff8c1cb8bcd8d65e38d86cb051fafa` |

Source-input digest: `89c8bc4bc3d9785320bfad78688f84821a14667fab0ace9ac93192b94c46b75f`. Lockfile digest: `ae1f6674add1c270ecce519724e7504d516d5364638ef271bc1079d1a25c7a44`. Local logs, artifact comparisons and browser reports/screenshots are retained under ignored `benchmark-results/glyf-format-rename/`.

These are local automated results, not a hosted CI pass or completed native screen-reader/file-dialog verification. Naming clearance and the previously recorded release limitations remain open. Earlier results below apply to their own candidates, not rc.3.

## rc.2 verification — 2026-11-22

The reviewed tree is based on `c83b5b5` plus the Glyf rename, before committing these changes. Local checks used Node **22.18.0**, Bun **1.3.14**, and the previously installed Chromium **159.0.8154.6** / WebKit **27.2** on macOS arm64.

- Frozen installation succeeded in the main checkout and two fresh source snapshots without existing dependencies, generated validator or `dist/`. Each fresh install added 285 platform-applicable packages. The only lockfile change is the private root package name; dependency versions/resolutions are unchanged.
- `CI=true bun run check` passed typecheck, lint, formatting, **625 tests across 32 files**, both demo validations and the production build.
- The complete production-browser suite passed **70/70 checks** against the extracted archive's site, without rebuilding it. It includes the new legacy `.MOSA` → `.glyf` download/reopen test in both engines, exact serialization equality, the retained wire marker, and the branded 320 px start screen. Existing offline editing, condition persistence, keyboard, error recovery, unsaved-change and strict-CSP checks also passed. This is automated evidence, not native screen-reader or file-dialog verification.
- All three archive/manifest/checksum outputs were byte-identical across both fresh builds and the main checkout. All 12 regular-file members, fixed archive metadata, internal checksums and 67 source-input fingerprints were verified. The packaged schema equals the unchanged working schema; the original rc.1 archive and supplied reference materials retain their bytes.

| Artifact                               |   Bytes | SHA-256                                                            |
| -------------------------------------- | ------: | ------------------------------------------------------------------ |
| `glyf-viewer-0.1.0-rc.2.tar.gz`        | 140,939 | `4974b3583cce2064d410c38199abf6345953041cce2f86abbf2a2ffcf312504c` |
| `glyf-viewer-0.1.0-rc.2.manifest.json` |   1,908 | `af9bc149d774ffeffa40a4f0cab4f7819c64ae38e414b0737cfa8317447a9ca8` |

Source-input digest: `994744e016ac45e729c5d8152fe4f7554a0a42b8a42ac0ceca13a7a7ee73faa3`. Lockfile digest: `ae1f6674add1c270ecce519724e7504d516d5364638ef271bc1079d1a25c7a44`. Logs, reproducibility records and browser reports/screenshots are in ignored `benchmark-results/glyf-rename/`. The 320 px WebKit start screenshot was also visually inspected: the name, wrapped tagline and file actions remain readable without horizontal overflow.

No hosted CI pass is claimed for these uncommitted changes. The rc.1 results below remain historical and do not establish an rc.2 pass.

## rc.1 verification performed — 2026-11-21

The reviewed working tree was based on **`557c86f`** with the candidate preparation changes applied. Two separate fresh source snapshots had **no `node_modules`, generated validator or `dist/`**. Each installed **285 platform-applicable packages** from the frozen lockfile. The lockfile stayed unchanged. Both builds and the main checkout produced identical archive, manifest and outer checksum bytes despite different absolute paths.

Environment: macOS **27.2.1 arm64**, Node **22.18.0**, Bun **1.3.14**, Vite **8.3.8**, Playwright **1.65.1**. This establishes reproducibility on that environment, not byte identity across untested operating systems, CPUs or toolchain versions.

| Check                                  | Result                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh-snapshot `CI=true bun run check` | Passed typecheck, zero-warning lint, formatting, **620 tests in 31 files**, demo validation and production build.                                                                                                                                                         |
| Archive regression tests               | 11 cases cover deterministic ordering, Unicode/binary/empty payloads, tar headers/checksums/padding, gzip metadata, unsafe/duplicate/overlong paths and a known SHA-256 value.                                                                                            |
| Independent archive verification       | macOS `tar` extracted all 12 files; Python `tarfile` verified regular-file metadata. Outer/inner SHA-256 checks and every manifest byte count/hash matched; inner/outer manifests were identical.                                                                         |
| Guard probes                           | Wrong Node pin, non-candidate app version, dotenv file and a `VITE_*` override all failed before building. Temporary probe changes were restored.                                                                                                                         |
| Extracted-package browsers             | Replaced the fresh snapshot's `dist/` with only the independently extracted `site/`; **68/68 Chromium/WebKit checks passed in 52.5 seconds** without rebuilding it. Covers strict CSP, offline editing/download/reopen, invalid files, keyboard flows and narrow layouts. |
| Compatibility and bundle               | Demo/schema and JavaScript/CSS bytes match the preceding viewer. Vite adds a 59,915-byte dependency-notice file; the format and runtime behavior are unchanged.                                                                                                           |

Candidate archive SHA-256:

```text
1970665fd91e45df7faa64b5fb15c4adfe2f1eb2df01ef08e4b75f09219e3e8a
```

Archive size: **140,525 bytes**. Adjacent manifest SHA-256:

```text
0ec906d355255de3963918383eede689b1ccacd3a496f5b1919546f8756c2be4
```

The source-input digest is `77525703cc43c9365ad15f81bdd354f4a58107aa0f5372f953b978e4a0679d71`. The unchanged Bun lockfile digest is `42ed27a9565acc55f91666f9a2873878aa75694c57e1f323c5fe1ee4fedb715b`. Local logs, comparisons, guard probes and browser evidence are retained under ignored `benchmark-results/pre-release/`.

These are fresh snapshots of the reviewed working tree, not a claim that the candidate changes were already committed. An initial verification attempt placed extracted assets inside a snapshot's lint search tree; lint correctly rejected that generated JavaScript. Moving the extraction outside the source tree restored the intended check scope; the clean full check above then passed. Browser results are automated evidence, not completion of the deferred native screen-reader/file-dialog checklist.

The predecessor's [Ubuntu CI run](https://github.com/farukumarx64/mosaic/actions/runs/44921241480) passed **609 tests and 68 browser checks** and uploaded reports. That hosted pass predates candidate packaging and the 11 archive tests. A hosted run of the final candidate changes remains to be observed after they are committed and pushed.

## Distribution status

Draft notes and local artifacts are ready for review. Public distribution still depends on the existing naming/extension checks, native accessibility/browser checks and supported-platform/memory disposition. The repository has no project license file; choosing distribution terms remains separate from collecting dependency notices. No public hosting, npm publication, Git tag or release upload was performed. Checksums provide byte integrity, not a signature or independent authentication.
