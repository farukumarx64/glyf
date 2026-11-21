# Manual public-release verification

**Status: incomplete; no completed manual passes.** The 2026-11-21 retry recovered Brave capture and opened the demo through an accessibility-button action. M01 remains incomplete because keyboard operation, a native file dialog and screen-reader output were not verified. M02–M13 remain not run. Native input failures and Safari timeouts are recorded in [the release-check report](public-release-checks.md#native-retry--2026-11-21). Automated accessibility-tree assertions do not verify screen-reader speech or native dialogs.

## Record a real test session

Record the tester, date, commit, OS/version, exact browser/version, screen reader/version, keyboard-navigation settings, zoom and window width. Record whether output was actually heard, read from the screen reader's own caption panel, or only inspected in an accessibility tree. Only the first two are direct screen-reader output; caption inspection does not certify audio timing or intelligibility.

Use a fresh browser profile where possible. Note any settings changed and restore them when finished. Do not test with private files. Capture only this synthetic document and its dialogs in evidence.

Start with **Safari + VoiceOver on macOS**, then a supported Chromium browser. If Windows users are in the supported audience, also run **NVDA with Chrome or Firefox on Windows**. Installed Safari/VoiceOver version metadata alone is not a completed test. Record unavailable combinations explicitly rather than silently reducing the supported scope.

```sh
npm run build
npm run preview -- --port 4180 --strictPort
```

Open `http://127.0.0.1:4180` in the actual browser. Use its normal UI and native file dialogs; do not inject JavaScript, programmatically focus controls, or substitute a headless run. Have the screen reader running before opening files. After assets load, exercise an actual offline mode if available and record exactly how it was established. If it cannot be established, leave the manual offline check pending; the automated suite already covers offline contexts.

Use these synthetic fixtures through **Open File**:

- [light.mosa](../tests/fixtures/manual-release/light.mosa): labeled text/numeric state, conditional content, editable string/number/boolean cells, nulls, negative values, bar/line summaries, safe/hostile Markdown and a 101-row progressive table.
- [dark.mosa](../tests/fixtures/manual-release/dark.mosa): identical content with a dark theme.
- [malformed.mosa](../tests/fixtures/manual-release/malformed.mosa): intentionally invalid JSON for recovery testing. Do not fix this fixture; rejection is expected.

Both valid fixtures passed the production parser/validator when prepared. That does not mark the following interactive checks as passed.

## Run and record

Record **pass / fail / not run**, actual output, focus destination and any reproducible defect for every row. Expected spoken wording may vary by screen reader; assess the name, role, value, relationships and usability, not an exact transcription of a particular engine.

| ID  | Action                                                                                                                                                                                       | Expected result                                                                                                                                                                                                                                                                        | Recorded result                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| M01 | Navigate the initial page using only keyboard/screen-reader commands. Activate Open Demo, then Open File and choose `light.mosa` in the native dialog.                                       | Actions have useful names. Native dialog is operable. After opening, Preview is identified as selected, focus is recoverable and the document title is discoverable.                                                                                                                   | Incomplete: demo loaded; keyboard, file chooser and VoiceOver unverified |
| M02 | Use heading/landmark navigation, then navigate the Preview/Source tab list with arrows and Home/End. Return to Preview.                                                                      | Logical heading sequence, named regions/tabs, correct selection and readable Source. No keyboard trap or invisible focus.                                                                                                                                                              | Not run                                                                  |
| M03 | Edit Note to `Release check 雪`, then Count to `7`. Observe the state values and unsaved status. Enter `1e` in Count, then press Escape.                                                     | Committed values update immediately. Invalid draft is identified and its error is discoverable/announced; committed Count remains 7. Escape restores 7. Focus stays usable and stale error text disappears. Record automatic announcements separately from text reached by navigation. | Not run                                                                  |
| M04 | Toggle Show conditional content off and on with the keyboard.                                                                                                                                | Checked state is identified, conditional text disappears/reappears and navigation remains coherent.                                                                                                                                                                                    | Not run                                                                  |
| M05 | Navigate the values table by rows/columns. Edit First's label to `Reviewed first`, set its Amount to `12`, and change its Enabled select to true. Try an invalid numeric draft, then Escape. | Headers and cell/editor names convey column and stable row. Select options are usable. Invalid feedback preserves the last valid value. No value buttons have specific names; null values are distinguishable from zero/false.                                                         | Not run                                                                  |
| M06 | Read the bar and line chart names and summaries after the cell edit.                                                                                                                         | Both charts are discoverable and their summaries reflect committed data. The null third amount is not presented as a zero-valued point. Charts can be understood without relying only on their shapes/colors.                                                                          | Not run                                                                  |
| M07 | Navigate the progressive table and activate Show 1 more row.                                                                                                                                 | Initially 100 of 101 rows are shown. Status updates to 101, the remaining row becomes reachable and focus moves to that newly revealed row.                                                                                                                                            | Not run                                                                  |
| M08 | Navigate Markdown links and the long code block. Activate Details; scroll the code block with the keyboard.                                                                                  | Details reaches its heading. Disabled images/raw HTML do not create image loads, executable content or unnamed links. Rejected link has no executable target. The code block has a useful name and can scroll without trapping focus.                                                  | Not run                                                                  |
| M09 | With unsaved edits, activate Open Demo and cancel the native confirmation. Then try choosing another valid file and cancel its discard confirmation.                                         | Dialog and buttons are understandable/operable. Cancellation preserves all edits, the current document and usable focus.                                                                                                                                                               | Not run                                                                  |
| M10 | Turn conditional content off, then activate Download using the keyboard. Handle any native download UI, then reopen that downloaded file through Open File.                                  | File can be located and selected through the native dialog. Saved Note, Count, cell values and conditional visibility survive re-import. Invalid drafts were not exported. Record the actual filename and any download prompt.                                                         | Not run                                                                  |
| M11 | Open `malformed.mosa` while the valid document is displayed. Navigate the resulting alert, then return to the preserved document and reopen the valid download.                              | Named file error receives usable focus. It conveys `INVALID_JSON`, the malformed-JSON message and the empty JSON Pointer `""` (document root). Existing content/edits remain available. Recovery succeeds. Record whether the alert was spoken automatically.                          | Not run                                                                  |
| M12 | Repeat representative editing/error/tab navigation with `dark.mosa`, at actual browser 200% zoom and a narrow window. Inspect visible focus, clipped labels and horizontal scrolling.        | Controls, error messages and focus remain visible/readable. Wide tables, Source and code scroll in their containers. Record actual viewport width; desktop resizing does not certify physical mobile browsers.                                                                         | Not run                                                                  |
| M13 | With assets loaded and a documented offline condition, edit state/cells, download and reopen.                                                                                                | Local workflow succeeds without relying on a remote service. Record whether link activation was excluded and how offline was established.                                                                                                                                              | Not run                                                                  |

Use this evidence record for each failed or completed case:

```text
Session / tester / date:
Commit / OS / browser / screen reader:
Screen-reader output: heard / captions / not observed
Case ID and result:
Actions and exact input:
Actual announcement or caption:
Focus before and after:
Expected versus observed behavior:
Evidence file / screenshot / notes:
Issue or follow-up:
```

## Completion rule

A reviewer should resolve reproducible failures and attach actual observations for the declared supported combinations before treating manual verification as complete. A prepared checklist, installed application, accessibility tree or successful automated run cannot fill an unexecuted row. Naming/trademark and extension decisions remain separate gates in [public-release-checks.md](public-release-checks.md).
