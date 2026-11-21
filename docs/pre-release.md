# Pre-release candidate preparation

Prepared **2026-11-21**. App **`0.1.0-rc.1`** is a local evaluation candidate. The document format remains **`0.1.0`**, the working extension remains `.mosa`, and `package.json` remains private. The [draft release notes](releases/0.1.0-rc.1.md) describe the included behavior and limitations. Packaging does not publish, tag, push or deploy a release.

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

The output directory is **`release/0.1.0-rc.1/`**, ignored by Git, lint and formatting:

| File                                     | Purpose                                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `mosaic-viewer-0.1.0-rc.1.tar.gz`        | Static viewer and evaluation materials in one versioned directory.                                                                       |
| `mosaic-viewer-0.1.0-rc.1.manifest.json` | Readable app/format/toolchain versions, source and lockfile digests, payload sizes and SHA-256 hashes; also included inside the archive. |
| `SHA256SUMS`                             | SHA-256 of the archive and adjacent manifest.                                                                                            |

Repeated preparation replaces only these generated files for this version. It leaves other version directories intact. The script always rebuilds `dist/`, so an old production build is not reused as a candidate. Changing included source or release-note bytes changes the source fingerprint and archive checksum; preserve reviewed artifacts and increment the candidate version for a new externally shared candidate.

The archive contains `site/`, package instructions, draft release notes, the unchanged demo and working schema, dependency notices, `SOURCE-FILES.json`, `manifest.json` and internal `SHA256SUMS`. Vite generates notices for the bundled app dependencies; Ajv's license is included separately because its helper is embedded during standalone-validator generation. Source code, `node_modules`, test evidence, environment files and Git metadata are excluded.

The [package README](release-package.md) explains outer/inner checksum verification, extraction, local serving, HTTP(S) hosting, the tested CSP, caching and a first edit/download/reopen workflow. Host only `site/` at an origin root; the unchanged candidate does not support a subdirectory mount or `file://`. The archive does not configure server headers itself.

## Reproduce the bytes

Use two fresh checkouts of the **same committed candidate source**, with identical line endings, exact Node/Bun versions and the frozen lockfile. In each, run `bun install --frozen-lockfile` and `bun run release:prepare`. Compare all three output files with `cmp` or their SHA-256 values. For example, with checkouts at `/tmp/mosaic-rc-a` and `/tmp/mosaic-rc-b`:

```sh
cmp /tmp/mosaic-rc-a/release/0.1.0-rc.1/mosaic-viewer-0.1.0-rc.1.tar.gz /tmp/mosaic-rc-b/release/0.1.0-rc.1/mosaic-viewer-0.1.0-rc.1.tar.gz
cmp /tmp/mosaic-rc-a/release/0.1.0-rc.1/mosaic-viewer-0.1.0-rc.1.manifest.json /tmp/mosaic-rc-b/release/0.1.0-rc.1/mosaic-viewer-0.1.0-rc.1.manifest.json
cmp /tmp/mosaic-rc-a/release/0.1.0-rc.1/SHA256SUMS /tmp/mosaic-rc-b/release/0.1.0-rc.1/SHA256SUMS
```

These paths are examples; do not compare against an older committed checkout while candidate changes are still uncommitted. If bytes differ, first compare `SOURCE-FILES.json` and the toolchain/lockfile fields before examining asset hashes.

The packager sorts archive paths without locale-dependent comparison, permits only regular files, rejects unsafe/duplicate/overlong member names, and fixes permissions to `0644`, uid/gid to zero and timestamps to the Unix epoch. It emits a regular-file-only ustar archive and gzip level 9 with no timestamp, source filename or host OS identifier. It uses Node built-ins instead of platform-specific archive creation flags. The archive is a distribution mechanism for the viewer, not a change to the `.mosa` file format.

The manifest fingerprints explicitly selected source/configuration/package inputs: `src/` except the generated validator, `scripts/`, package/toolchain/build configuration, schema, demo and the two packaged documentation files. The generated validator is rebuilt from source. Inputs do not include test evidence, this verification report, general repository documentation or Git history. This avoids a circular dependency between the recorded archive hash and the archive itself. The input list and lockfile digest identify reproducible content; they do not assert a signed source revision or supply the source code.

## Verification performed

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
