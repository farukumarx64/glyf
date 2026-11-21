# Continuous integration

Added **2026-11-21**. [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) defines the **CI** workflow and its single **Validation and browser checks** job. It runs on pull requests, pushes to `main`, and manual dispatch from GitHub's Actions tab. No path filters skip documentation, configuration or format changes.

## What runs

1. Check out a fresh source tree on **Ubuntu 24.04**, with read-only repository permissions and no persisted checkout credentials.
2. Install Node from `.nvmrc` (**22.18.0**) and Bun from `package.json` (**1.3.14**). There is no independent CI runtime-version list to keep in sync.
3. Run `bun install --frozen-lockfile`, including the existing toolchain guard and esbuild setup. A manifest/lockfile mismatch fails the job.
4. Run `bun run check`: regenerate the standalone Ajv validator, typecheck, lint with zero warnings, check formatting, run all Vitest tests, validate the reference `.mosa` document, and build the static production viewer.
5. Install the locked Playwright package's Chromium headless shell, WebKit and their Linux system dependencies with `bun run playwright install --with-deps --only-shell chromium webkit`.
6. Run `bun run playwright test` against the production build already created in step 4. Playwright starts/stops the loopback preview server itself. This uses the same tests as `bun run test:viewer`, without a duplicate build.
7. Upload available browser reports and test artifacts as **browser-results**, retained for **seven days**, on success or failure unless the run was cancelled. If an earlier step failed before browser output exists, the upload is skipped without obscuring the original failure.

The browser suite includes strict-CSP startup, hostile Markdown and malformed-file handling, editing, unsaved replacement, offline download/reopen, keyboard/label assertions and narrow layouts. These are automated checks; they do not certify native file dialogs or actual screen-reader speech.

The workflow uses full commit SHAs for checkout, Node/Bun setup and artifact upload, with release labels alongside them. Its token needs only `contents: read`; no deployment credentials or custom secrets are needed. Node's package-manager cache is disabled, and neither `node_modules` nor browser installations are restored from caches. The Bun setup action can cache the versioned Bun executable. Action upgrades should deliberately update the SHA and its release label together.

## Failures and resource bounds

When `CI` is set, Playwright rejects `test.only`, uses **one worker**, stops the suite after **10 minutes**, writes a line log plus a non-opening HTML report, and retains traces/screenshots for failed tests. Tests retain the existing default of zero retries: a failure remains a failure. Local runs retain the usual worker count and avoid automatic trace capture.

Vitest keeps its default **five-second** per-test timeout except for the two maximum-size hostile Markdown recovery cases in [markdown-recovery.test.tsx](../tests/markdown-recovery.test.tsx), which allow **30 seconds** each. They exercise the complete 20,000-character inputs and every existing recovery/immutability assertion. This is a correctness-test allowance for expensive parsing on shared runners, not a viewer responsiveness guarantee. The ordinary depth-boundary cases retain the default timeout.

The job has a **25-minute** limit, leaving room for setup, browser installation and artifact upload around the browser-suite timeout. A newer run cancels an older run for the same workflow/event/ref. Cancelling does not affect unrelated pull requests or branches.

Open a failed Actions run and inspect its first failing step. For browser failures, download **browser-results** and inspect the HTML report or open a trace with the pinned local CLI:

```sh
bun run playwright show-report /path/to/extracted/playwright-report
bun run playwright show-trace /path/to/extracted/test-results/test-case/trace.zip
```

Generated `playwright-report/` output is excluded from Git, lint and formatting. Existing `test-results/` handling continues to cover screenshots, exports and per-case evidence.

## Reproduce locally

With the pinned toolchain installed:

```sh
bun install --frozen-lockfile
CI=true bun run check
bun run playwright install --with-deps --only-shell chromium webkit
CI=true bun run playwright test
```

The `--with-deps` step installs Linux browser prerequisites on CI; on a developer machine with installed browsers, it is not necessary to repeat installation just to rerun tests. For the ordinary local build-and-browser command, use `bun run test:viewer`.

## Verification and activation

Verification used a fresh snapshot of the working tree based on `135f41d`, without `node_modules` or a generated validator. Local environment: macOS 27.2.1 arm64, Node 22.18.0, Bun 1.3.14, Playwright 1.65.1, Chromium 159.0.8154.6 and WebKit 27.2. Browser binaries were already installed on this machine.

| Check                             | Result                                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `actionlint` 1.7.12               | Passed workflow syntax, expressions and action-input checks. Action commit SHAs were separately matched to their official release tags. The temporary linter binary was verified against its published SHA-256. |
| Clean frozen installation         | Passed; 285 platform-applicable packages installed. The toolchain guard ran, and `bun.lock` remained unchanged.                                                                                                 |
| `CI=true bun run check`           | Passed typecheck, zero-warning lint, formatting, **609 tests across 30 files**, reference-demo validation and production build. The standalone validator was generated from source.                             |
| `CI=true bun run playwright test` | **68/68 passed** with one worker; an HTML report and per-case artifacts were created.                                                                                                                           |
| Temporary focused-test probe      | `test.only` rejected with exit code 1 and the expected `forbidOnly` diagnostic.                                                                                                                                 |
| Temporary failing-browser probe   | Deliberate assertion failure returned exit code 1 and produced a valid trace ZIP, failure PNG and HTML report. The temporary test was removed.                                                                  |
| Artifact/format preservation      | Dependency versions, lockfile, generated validator, schema, reference demo and production JS/CSS bytes match the pre-CI checkout.                                                                               |

The probes verify the failure-handling configuration; they are not failures in the product suite and are not committed tests. Logs, fingerprints, successful-suite reports and negative-probe artifacts are retained locally under ignored `benchmark-results/ci/`. No new package dependency was needed.

The browser installation and serial-worker choices follow [Playwright's CI guidance](https://playwright.dev/docs/ci). Local Docker was unavailable because its daemon was stopped; local verification used macOS. The hosted result below records Ubuntu evidence separately.

### First hosted run and timeout correction — 2026-11-21

[GitHub Actions run 44919364725](https://github.com/farukumarx64/mosaic/actions/runs/44919364725), for commit `1013c10`, failed in `bun run check` on Ubuntu 24.04. Node/Bun setup, the frozen install (286 platform-applicable packages), validator generation, typecheck, lint and formatting passed. **608 of 609 tests passed**; the maximum-size nested-emphasis recovery case took **8.910 seconds** and exceeded Vitest's default **5,000 ms** timeout. The log reported a timeout, with no assertion mismatch. Demo validation, the production build and browser steps were not reached. No browser report existed to upload.

The same case passed locally before the fix in **3.829 seconds**. The correction gives only the two maximum-size hostile Markdown cases a **30,000 ms** timeout. No test is skipped or retried, the fixtures/assertions are unchanged, and application code, format limits, dependencies and global test timeouts are unchanged. Markdown parsing remains synchronous; see the [security audit's boundaries](security-audit.md#boundaries-and-remaining-phase-5-work).

After the correction, local `CI=true bun run check` passed all **609 tests across 30 files**, typecheck, lint, formatting, demo validation and the production build. `CI=true bun run playwright test` passed **68/68 Chromium/WebKit tests in 48.1 seconds**, with one worker. The browser run required local sandbox permission to bind the preview server to loopback. Logs are retained under ignored `benchmark-results/ci-timeout-fix/`.

The subsequent [hosted run 44921241480](https://github.com/farukumarx64/mosaic/actions/runs/44921241480), at `557c86f`, **passed on Ubuntu 24.04**: frozen installation, all check/build stages, **609 tests**, browser installation and **68 browser tests**, followed by a successful **browser-results** upload. This resolves the first-hosted-pass verification gap for that commit. Candidate packaging and its new archive tests are later changes; their local evidence is recorded in [pre-release preparation](pre-release.md), not attributed to this earlier hosted run.

Required-check enforcement is separate from running CI: repository branch protection/rulesets must require **Validation and browser checks** if merges should be blocked on it. This task adds the workflow without changing repository protection or publishing the application. The existing naming, extension, memory and manual-accessibility release gates remain open.
