# Public-release checks — 2026-11-20, retried 2026-11-21

**Public release is not cleared.** The preliminary naming review found close existing uses of **Mosaic**, including declarative visualization software. Manual browser and screen-reader checks remain incomplete. An earlier 2026-11-21 retry recovered Brave capture and opened the demo, but native input remained unreliable, Safari selection timed out, and no VoiceOver output was observed. A subsequent attempt returned native capture error `-3811` before test interaction. The extension search found no confirmed `.mosa` format collision in the accessible results, but registry coverage is incomplete. These are open gates, not passed checks.

**Launch scope: worldwide**, explicitly confirmed by the user as “everywhere.” This is the intended distribution scope, not a claim of worldwide trademark clearance.

Reviewed application commit: **`daf2de6`**. This follow-up adds documentation, synthetic manual-test fixtures and a narrow formatter exclusion for the intentionally malformed file. It does not rename the product, change the format, grant trademark clearance, publish a package, create a release/tag or deploy the viewer.

## Results and boundaries

| Check                                           | Result                                                | Evidence / remaining work                                                                                                                                                                                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production build                                | Passed                                                | Strict TypeScript and Vite build; JS/CSS assets match the previously verified build.                                                                                                                                                                                      |
| Installed Brave production workflows            | **34/34 automated tests passed**, 16.3 seconds        | Existing full production suite, headless with a fresh isolated profile. Includes accessibility semantics/keyboard workflows, strict CSP, file recovery, edits, download/reopen and offline contexts. This is not manual testing.                                          |
| Safari + VoiceOver native interaction           | **Blocked; not run**                                  | Safari selection timed out again on 2026-11-21. Brave capture and Open Demo recovered, but keyboard/file-dialog operation remained unverified and a coordinate click failed with `noWindowsAvailable`. No screen-reader output or completed manual workflow was observed. |
| Other manual browser/screen-reader combinations | **Not run**                                           | Chrome and Firefox were not found at their standard `/Applications` paths; Windows/NVDA and physical mobile testing were not available in this session. Availability elsewhere was not exhaustively inventoried.                                                          |
| Working-name collision screen                   | **Conflicts found; name remains provisional**         | Closely related software already uses Mosaic. This establishes product/namespace crowding, not a legal finding of infringement.                                                                                                                                           |
| Trademark registry clearance                    | **Incomplete**                                        | Worldwide launch is confirmed; jurisdiction-specific clearance remains outstanding. USPTO's search shell returned no readable results; WIPO presented a verification challenge. No record-by-record status or similar-mark search was completed.                          |
| `.mosa` extension screen                        | **No confirmed collision found; incomplete coverage** | Exact web queries returned no established `.mosa` format description in the accessible results. PRONOM and extension-directory retrievals were unavailable. This is not proof of uniqueness or a registration.                                                            |
| Memory stability                                | Still unconfirmed                                     | [The prior investigation](memory-stability.md) reproduced browser-native table retention; this review does not change R1.                                                                                                                                                 |

## Browser and screen-reader work

The host inventory identified Safari **27.2**, Brave **157.1.99.55**, Arc **1.173.1**, and VoiceOver Utility **10**. These are local application metadata, not evidence that a screen-reader workflow ran. The reported Utility version is not asserted to be a speech-engine version.

Native computer-use inventory initially succeeded. Selecting Safari then failed with `unknown or expired node_repl continuation`. After resetting the connection, a new inventory call with a 10-second execution limit failed with `js execution timed out; kernel reset`. The failure occurred before an observable test page or VoiceOver output. There is no manual pass, heard announcement, caption transcript or native-dialog result to record. No VoiceOver or accessibility preference was changed. Safari selection may have launched the application before the connection failed; its resulting UI state could not be confirmed.

On the follow-up retry after the user confirmed worldwide launch, native inventory and Brave app selection recovered. A dedicated tab navigated to `http://127.0.0.1:4180` and showed the Mosaic page title, but no rendered viewer controls were observed. Attempts to inspect/reload it encountered foreground-focus changes and `frontmostApplicationChanged`; reliable interaction could not proceed. This is an unresolved native observation, not a diagnosed application defect or a completed manual workflow. The user subsequently confirmed that the computer was available for testing. VoiceOver was not enabled and no screen-reader output was observed.

After that availability confirmation, app selection and accessibility-tree retrieval both failed with `com.apple.ScreenCaptureKit.SCStreamErrorDomain`, code `-3811`: “Failed to start stream due to audio/video capture failure.” A fresh computer-use session produced the same error. That was the immediate access blocker at that point; availability confirmation did not resolve it. No VoiceOver setting was changed and no additional manual test was completed during that attempt. The failure source was the native capture service, not an observed Mosaic validation or rendering error. [OpenAI's capture troubleshooting guidance](https://learn.chatgpt.com/docs/appshots?surface=app) recommends checking the existing Screen & System Audio Recording and Accessibility permissions for Codex Computer Use, then restarting the desktop app. That was a recovery step to try, not a verified remedy for this specific error; the underlying cause of `-3811` was not established.

### Native retry — 2026-11-21

The user's retry request produced a partial recovery. Brave's native accessibility tree and screenshot showed the initial viewer, and an accessibility-button activation of **Open Demo** loaded **Mosaic Demo**, selected Preview and exposed the note input, checked chart toggle, chart summary and editable revenue table. Preview received focus after loading. This resolves the earlier blank-page observation for this attempt; it does not diagnose its earlier cause. The local production preview was restarted on port 4180. No runtime code or build assets changed.

Manual verification still could not proceed reliably:

- Selecting Safari returned `Computer Use server error -10005: timeoutReached` after about 50 seconds despite a requested 10-second limit.
- Tab and Return commands produced no observable navigation or activation. Open File received focus, but no native chooser was observed after activation attempts. A screenshot-based coordinate click then returned `Computer Use server error -10005: noWindowsAvailable`.
- VoiceOver Utility opened after about 250 seconds despite a requested 10-second limit. Two Command-F5 attempts produced no observable activation or screen-reader output. No speech or captions were available, and the final VoiceOver on/off state was not established. No preferences or security permissions were deliberately changed; the utility window was sent a close action afterward, whose completion was not verified.

These are partial native observations and unresolved control failures, not passed keyboard, file-dialog or screen-reader cases. They do not establish a Mosaic defect. M01 remains incomplete; M02–M13 remain unexecuted. The next verification must establish reliable input and the actual VoiceOver state before continuing. The demo remains available in the dedicated Brave tab; unrelated tabs were not operated on.

### Subsequent manual-check attempt — 2026-11-21

At repository revision `158b307`, another requested manual session could not reach test interaction. Native inventory timed out after 10 seconds and reset the tool kernel. Direct Brave selection in the fresh session then returned ScreenCaptureKit `-3811`, “Failed to start stream due to audio/video capture failure.” No keyboard, VoiceOver, file-dialog, error-recovery, download/reopen, narrow-layout or offline case was completed in this attempt. No UI input or settings changes were issued.

The production preview was restarted at `http://127.0.0.1:4180/` and returned HTTP 200. Its JavaScript and CSS SHA-256 hashes still match the previously tested build. Those server and artifact checks establish readiness for a test, not a manual pass. The user was asked whether the existing Accessibility and Screen & System Audio Recording permissions had been confirmed and Codex fully restarted; the capture failure alone does not establish a permission diagnosis. The checklist results remain unchanged.

Permission guidance was subsequently corrected for the installed **macOS 27.2.1 (26B131)**. The relevant privacy permission is named **Device Control and Data Access** on this version; the Accessibility sidebar is a different settings area. The [vendor migration note](https://community.teamviewer.com/English/discussion/151697/changes-in-mobile-device-management-mdm-on-macos-27-affecting-teamviewer) documents the macOS 27 rename, and [Apple's update](https://developer.apple.com/news/?id=oqng0zjk) describes further changes in 27.3. Earlier instructions using the old privacy-permission label did not match this Mac.

The user confirmed that **Codex Computer Use** was already enabled under both Device Control and Data Access and screen recording. Following the app-restart instructions, the next requested retry again failed during direct Brave selection with ScreenCaptureKit `-3811`, before any test interaction. The restart itself was not independently observed. These are user-confirmed permission settings, not an independent audit of effective OS authorization. No additional ChatGPT permission was requested or enabled, and no new manual pass was recorded. Further identical retries are not useful without a change in the capture service; recovery or a guided session with a human operating the native browser is still required.

The user later clarified that the Mac had already restarted during the update to 27.2.1 before the initial manual-check attempt. Research then found an exact matching, still-open [Codex capture report #38348](https://github.com/openai/codex/issues/38348). Reporters describe selection of Stage Manager thumbnails or off-Space windows, failed display lookup, and subsequent `-3811`/`-3812` errors despite granted permissions. An [on/off/on comparison](https://github.com/openai/codex/issues/38348#issuecomment-6053563868) reproduced failure with Stage Manager enabled and success when disabled. Our earlier small, tilted Brave screenshot resembles that symptom, making window selection/Stage Manager a leading hypothesis, not a confirmed local diagnosis. The user initially confirmed that Stage Manager was on; the later off-state retry is recorded below.

The proposed targeted check was to test with Stage Manager disabled and a normal browser window visible on the active desktop; [Apple documents the control](https://support.apple.com/en-ie/guide/mac-help/mchl534ba392/27/mac/27). [Report #30846](https://github.com/openai/codex/issues/30846) describes other suspected helper/audio causes, so the error text alone does not establish one cause. These are first-hand issue reports, not a vendor-confirmed universal fix. No Stage Manager preference, capture process or security permission was changed during the research itself, and no external report was submitted.

### Stage Manager off and helper restart — 2026-11-21

The user reported Stage Manager off and later confirmed Brave's actual window was visible on the current desktop. Direct Brave capture still returned `-3811`. A narrow capture-log query then showed `failed display lookup` with `contentRect=[x=-271, y=175, width=173, height=163]`. That supplies local evidence of an invalid target/display association resembling the reported thumbnail failure; it does not prove why that target was selected or independently verify the user's window-management settings.

Process inspection found one capture helper. Its executable identity was rechecked immediately before sending SIGTERM to PID 10939. After resetting the computer-use connection, logs confirmed replacement helper PID 20771. It first recorded a full-display rectangle, then selected the same negative-position, thumbnail-sized rectangle and repeated the display-lookup failure. Brave capture again returned `-3811`. This rules out recovery from that single helper restart; it does not establish a permanent root cause. A comparison attempt to select Calculator stalled for about 428 seconds despite a requested 10-second timeout and ended with `unknown or expired node_repl continuation`. No Calculator UI result or successful native interaction was observed.

Installed metadata for the diagnostic: desktop bundle `com.openai.codex` **26.1117.31558**, build **29513**; capture helper `com.openai.sky.CUAService` **26.1116.1001980**, build **1001980**; macOS **27.2.1**, build **26B131**. The refreshed helper was no longer listed in the later process snapshot. The agent changed no security permissions or Stage Manager preference, stopped only the identity-checked capture helper, and submitted no external report. Manual cases remain incomplete. Further work requires reliable native capture or a guided test with a human operating the browser; no Mosaic runtime change is justified by these diagnostics.

While that access was unavailable, the existing Playwright suite ran against the actual installed Brave executable, using the same production build and temporary automation profiles. The configuration retained the existing base URL and viewer server, changed the project to Chromium with the explicit Brave executable, and ran every existing production test. All **34** passed. Those results extend automated branded-browser coverage; they do not verify native file-dialog navigation or spoken screen-reader output. The earlier Chromium/WebKit suite's 68 passing tests remain historical evidence, not a new manual result.

The exact temporary configuration, JSON results and log are saved locally in ignored `benchmark-results/public-release-checks/`. To reproduce the Brave comparison from the repository root, create the following configuration in that directory and run the command below. Adjust the executable only to a verified local installation.

```ts
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config.ts';

export default defineConfig({
  ...base,
  testDir: '../../tests/browser',
  outputDir: './brave-results',
  projects: [
    {
      name: 'brave',
      use: {
        browserName: 'chromium',
        launchOptions: {
          executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        },
      },
    },
  ],
});
```

```sh
npm run build
npx playwright test --config benchmark-results/public-release-checks/playwright.brave.config.ts
```

The [manual checklist](manual-release-checklist.md) contains thirteen cases with expected outcomes and an evidence template: M01 has partial native observations, and none is a completed manual pass. Three [fixtures](../tests/fixtures/manual-release/) make the work concrete: light/dark valid documents and intentionally malformed JSON. They cover numeric draft errors, editable typed cells, chart summaries, conditional content, a 101-row progressive table, safe Markdown, native replacement dialogs and download/reopen. The two valid files pass `parseMosaic` and preserve their values through parse–serialize–parse checks; the malformed file returns `INVALID_JSON` with the empty root pointer. Fixture validation is distinct from interaction testing.

## Naming and namespace findings

The following were checked using accessible primary project/vendor sources on the review date. No source was treated as authorization to change this repository or publish anything.

| Existing use             | What was verified                                                                                                                                                                                                                                                                                                                      | Relevance to this project                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UW/CMU Mosaic            | [Mosaic Declarative Specifications](https://idl.uw.edu/mosaic/spec/) describes JSON/YAML specifications containing data, parameters, plots, inputs and layouts, with parser/application generators.                                                                                                                                    | **Close technical and discovery overlap.** This is the strongest reason to choose a more distinctive public name before presenting another Mosaic visual-document specification.                                             |
| Mosaic AI / Databricks   | [Official platform material](https://answers.databricks.com/intro-mosaic-ai-platform-building-data-intelligence-into-your-ai-solutions-_OWgnWNfWkI) uses Mosaic AI for AI tooling. [Current product-name documentation](https://docs.databricks.com/gcp/en/resources/product-name-changes) records several renamed Mosaic AI products. | AI-related naming crowding. Renamed product names do not establish abandonment of trademark rights. No legal status is inferred.                                                                                             |
| Mosaic desktop assistant | [The product website](https://www.mosaicdesktop.ai/) describes a desktop assistant working with documents, email, calendars and tasks.                                                                                                                                                                                                 | Potentially overlapping AI/document messaging. Ownership or any relationship to this repository was not established.                                                                                                         |
| NCSA Mosaic              | [University of Illinois archival material](https://guides.library.illinois.edu/Natural_and_Applied_Sciences_Archives/MOSAIC_Browser) documents the established browser name.                                                                                                                                                           | Historical software/search collision. Historical use alone does not determine current trademark status.                                                                                                                      |
| Unscoped npm `mosaic`    | A live `npm view mosaic name version description repository homepage --json` query returned **2.1.0**, an HTML-enhancement library associated with [defx/mosaic](https://github.com/defx/mosaic).                                                                                                                                      | The package name is already occupied. This repository remains `private: true`; its local package name does not reserve a public namespace. A future public package needs an available name/scope and separate authorization. |

**Recommendation:** retain Mosaic as an internal working name while choosing a distinctive public name, then repeat collision/trademark checks for that candidate in the intended markets. Do not silently rename the `.mosa` extension, `mosaic` format marker, schema identifiers or existing files: that is a separate compatibility decision requiring an explicit plan. No replacement name is proposed as “available” without checking it.

This was a preliminary public-use screen, not a legal clearance opinion. [USPTO guidance](https://www.uspto.gov/trademarks/search/federal-trademark-searching) calls for looking at similar wording and related goods/services, beyond an exact-name lookup. [WIPO's database guidance](https://www.wipo.int/en/web/global-brand-database) also recommends checking relevant national/regional registers. The user has confirmed worldwide launch. Trademark protection and rights depend on national/regional systems; [WIPO explains protection abroad](https://www.wipo.int/en/web/trademarks/protection), and its Global Brand Database covers participating collections rather than every national record. A qualified trademark professional should define and conduct a jurisdiction-specific review for the chosen name, recording what was searched and what remains unreviewed. A risk-based search order can make the work manageable, but a limited search must not be labeled worldwide clearance. No registration or legal engagement is authorized by this scope clarification.

The attempted [USPTO search](https://tmsearch.uspto.gov/) returned a JavaScript search shell with no readable records. [WIPO Global Brand Database](https://branddb.wipo.int/) returned a verification challenge; it was not bypassed. No claim is made about registration numbers, owners, live/dead status, classes, priority or worldwide availability. Exact and confusingly similar marks, relevant goods/services, pending applications and local/unregistered use remain to be reviewed.

## Extension and media-type findings

Queries included `".mosa" "file"`, `".mosa" "extension"`, `".mosa" file format`, and site-restricted searches of FileInfo, File-Extensions and PRONOM. The retrieved results included unrelated acronyms/product names and references to other suffixes; none established an existing `.mosa` file format. This is a limited negative search result, not an exhaustive registry search.

Direct FileInfo and File-Extensions lookups could not be retrieved through the browsing tool. [PRONOM](https://www.nationalarchives.gov.uk/PRONOM/) returned HTTP 403. Those sources are **unverified**, not recorded as “no match.” A completed extension review should revisit a file-format registry and developer/vendor documentation for any candidate matches once access is available.

The accessible [IANA media-type registry](https://www.iana.org/assignments/media-types), updated 2026-11-18, contained no text match for `mosa` or `mosaic`. This registry assigns media types; it is not a global reservation system for filename suffixes. IANA's [application/json record](https://www.iana.org/assignments/media-types/application/json) lists `.json`; it does not register `.mosa` or a Mosaic-specific media type.

Keep the specification's description of `.mosa` as **working and unregistered**. The viewer continues using `application/json` for JSON downloads and validating document contents/version. Do not claim an IANA assignment, unique suffix, operating-system file association or standard status. The name decision and remaining registry work must be recorded before freezing the public format identity.

## Release disposition

Public-release preparation remains blocked on actual manual evidence and a naming decision with appropriate clearance. Required next evidence is concrete:

1. Complete the manual checklist in the declared supported browser/screen-reader combinations, with actual announcements, focus behavior and native-dialog observations; fix and retest any failures.
2. Choose the intended public name for the confirmed worldwide launch; complete an appropriately scoped national/regional registry and similar-mark review, documenting coverage and remaining gaps. Existing close uses make proceeding under Mosaic without that review inadvisable.
3. Finish the unavailable extension-registry checks and record whether `.mosa` remains the chosen provisional suffix or needs a separately approved compatibility change.
4. Preserve the documented native-memory limitation in release notes. Do not turn the implementation Definition of Done into an unconditional public-release approval.

No application code, dependency, file-format rule or resource limit changed. No release, package, tag, push, external message, domain registration or trademark application was created.

Formatting and `git diff --check` pass. The intentionally malformed fixture is excluded individually from Prettier so formatting cannot repair the invalid input. No new automated test cases or runtime changes were needed; the 34-case Brave run and fixture checks are the fresh verification for this documentation/test-data follow-up.
