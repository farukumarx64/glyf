# Phase 0 verification

**Completed:** 2026-11-13 (Africa/Lagos). Only Phase 0 was implemented.

## Delivered

- Single-app Vite/React project with strict TypeScript, ESLint, Prettier, and Vitest.
- Exact direct dependency versions, `package-lock.json`, Node engine constraints, and `.nvmrc`.
- All 14 portable node types plus document, theme, state-value, dataset, and row types.
- Working schema with the approved `id` column prohibition; unmodified originals retained for reference.
- Working specification incorporating all eight accepted decisions and marking Phase 0 complete.
- Reference demo, schema-validation command, and 38 automated schema checks.
- Minimal React foundation screen; no document-import, rendering, editing, or export implementation.
- README with environment setup and development/check commands. No secrets or environment variables are required.

## Verified environment

| Tool              | Version |
| ----------------- | ------- |
| Node.js           | 22.18.0 |
| npm               | 10.9.3  |
| Vite              | 8.3.8   |
| React / React DOM | 19.3.1  |
| TypeScript        | 6.0.3   |
| Vitest            | 5.1.0   |
| Ajv               | 8.20.0  |

Package engines and peer dependencies were checked against the npm registry. TypeScript 6.0.3 was selected because the current TypeScript ESLint package requires a version below 6.1. The local Node installation was retained; no system runtime was changed.

## Commands actually run

| Command                                                                                               | Outcome                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install --cache /private/tmp/mosaic-npm-cache --fetch-retries=1 --fetch-timeout=30000 --no-fund` | Passed; generated the lockfile. Audit findings are described below.                                                                       |
| `npm ci --offline --cache /private/tmp/mosaic-npm-cache --no-audit --no-fund`                         | Passed; reinstalled from the lockfile and populated cache.                                                                                |
| `npm run validate:example`                                                                            | Passed Draft 2020-12 validation before the app UI files were added.                                                                       |
| `npm run typecheck`                                                                                   | Passed.                                                                                                                                   |
| `npm run test`                                                                                        | Passed: 1 test file, 38 tests.                                                                                                            |
| `npm run format`                                                                                      | Applied formatting; supplied reference files were excluded.                                                                               |
| `npm run check`                                                                                       | Passed typecheck, lint, formatting check, all 38 tests, example validation, and production build.                                         |
| `npm run dev -- --port 5173 --strictPort`                                                             | Started on `127.0.0.1:5173`; the Mosaic heading and foundation text rendered in the in-app browser. Server stopped after the smoke check. |
| `npm audit --json` (with the temporary cache and network timeout options)                             | Reported 9 moderate package findings tracing to one development-only advisory.                                                            |
| `npm audit --omit=dev --json` (with the same options)                                                 | Passed: zero reported runtime dependency vulnerabilities.                                                                                 |

The temporary npm cache path was used for the execution environment's filesystem permissions; it is not a project setup requirement. An initial `tsx` CLI invocation encountered a restricted-environment IPC-listener error. The final script uses `node --import tsx` and passed both directly and in the aggregate check.

The tests cover the supplied demo, the exact approved schema amendment, typed fixtures for all 14 nodes, optional-field defaults remaining absent, rejection without input mutation, unknown fields/types, required properties, version, scalar restrictions, non-finite numbers and overflow, and selected numeric/string boundaries. They do **not** claim semantic validation coverage, which belongs to Phase 1.

## Build output

The successful production build reported:

| Artifact   |      Size | Gzip size |
| ---------- | --------: | --------: |
| HTML       |   0.47 kB |   0.30 kB |
| CSS        |   0.96 kB |   0.52 kB |
| JavaScript | 219.90 kB |  68.76 kB |

These are Vite's build-size measurements for the foundation screen, not benchmarks for the finished viewer. Loading, rendering, editing, and memory performance have not yet been measured.

## Dependency audit limitation

The initial full audit reported 9 moderate package findings caused by the same transitive dependency: `minimatch` 10.2.6, used by ESLint and TypeScript ESLint tooling. The advisory concerns excessive CPU/memory consumption from attacker-controlled glob patterns with an affected optimization setting. See [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).

The published patched version is 11.0.1, outside the selected tooling's declared `^10` dependency ranges. No forced major-version override or automatic audit fix was applied. This dependency is development-only, and the foundation does not pass Mosaic document content into its glob patterns. `npm audit --omit=dev` reports zero findings.

Revisit this advisory when a compatible upstream tooling update is available. This report does not claim a clean full dependency audit or a security audit of the complete product.

## Remaining work

Phase 1 must implement the byte/encoding guards, duplicate-property scanner, iterative resource and cycle checks, full semantic validation, structured parser errors, and safe serialization. Schema-only tooling must not be exposed as a complete untrusted-document validator.
