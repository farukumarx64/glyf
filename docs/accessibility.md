# Phase 5 — Accessibility and browser verification

Completed **2026-11-19**, using the production build, Node **22.18.0**, Playwright **Chromium 159.0.8154.6**, and **WebKit 27.2**.

## Findings and fixes

### Focus when conditional content disappears

A toggle or number input can change the state that controls its own parent `when`. Previously, removing that focused control left focus on the page body. The new component regressions reproduced this for both control types.

[DocumentView.tsx](../src/app/DocumentView.tsx) now remembers the focused Preview element. After a document update, if that element has disappeared and focus has fallen to the body, focus returns to the existing Preview panel. Tab then reaches the remaining document controls. Focus on a surviving control, Source, or another application element is preserved. Removed elements are forgotten, and switching to Source clears the remembered Preview element, avoiding stale focus restoration and retained detached DOM references.

### Unnamed Markdown links

An empty, whitespace-only, or image-only Markdown link could remain focusable even though it had no visible or accessible label. Images were correctly disabled, but their enclosing anchor remained.

[MarkdownView.tsx](../src/render/MarkdownView.tsx) now checks the remaining rendered children for text and omits an unnamed anchor. Formatted text links remain available, including text beside a removed image. The original Markdown is unchanged for export, and the existing URL policy still applies. The security browser test now expects three named links instead of an additional empty image link.

### Keyboard access to wide code blocks

Markdown code blocks previously had horizontal scrolling styles without an explicit keyboard focus target. They now expose a focusable group named **Code block**, with the existing visible focus indicator. Both engines verify Tab navigation into the block and ArrowRight scrolling at 320 CSS pixels.

### Control boundaries

The previous input border contrast against the field background was **1.37:1 in light mode** and **1.76:1 in dark mode**. A dedicated trusted CSS token now gives editable controls and file-action buttons clearer boundaries: **3.77:1 light** and **4.87:1 dark** for field borders. Decorative table rules retain their existing appearance. No schema fields, format limits, or dependencies changed.

### Enlarged tab labels

At 320 pixels with 200% text, the tab labels previously split into fragments such as `Pre` / `vie` / `w`. The tab bar now wraps whole buttons while keeping each label on one line. Both browsers check the actual text rectangles as well as page-width overflow. Tab keyboard behavior remains unchanged.

## Complete keyboard workflows

[browser/accessibility.spec.ts](../tests/browser/accessibility.spec.ts) adds six scenarios per browser, including complete workflows at **320 pixels/light mode** and **375 pixels/dark mode**. Within those workflows, in-page interaction uses actual keyboard events rather than locator clicks, programmatic focus, or field filling. Playwright supplies files to the native chooser and handles the confirmation dialog.

The workflow covers:

1. Reach Open File with Tab and activate it with Enter. Opening focuses Preview.
2. Edit multiline Unicode state; verify the polite, atomic unsaved-status region.
3. Enter an invalid numeric state draft. Verify focus stays in the input, `aria-invalid` is set, `aria-describedby` resolves to the alert, and the last valid state remains visible. Escape restores the committed value and removes the obsolete description.
4. Toggle conditional content with Space. Edit string, numeric and boolean table cells; exercise invalid feedback, Escape, and the No value button. Verify chart summaries update with committed data.
5. Cancel a dirty Open Demo replacement and verify focus returns to the invoking button while edits remain.
6. Use Home, End, arrow keys, Tab and Shift+Tab to navigate Preview and Source. Verify selected-tab state, controlled-panel relationships, and complete Source values.
7. Activate Download with Enter, inspect the real downloaded bytes, and reopen through the keyboard-operated file chooser. Verify values persist and focus returns to Preview.
8. Open malformed JSON, verify the named alert receives focus, Tab back into the document, and recover by reopening the valid download.

The workflows run offline after app assets load and require zero non-Blob request attempts, zero uncaught page errors, and exactly the one planned discard confirmation. The native boolean select uses keyboard type-ahead (`t` for `true`); macOS WebKit uses Option+Tab to include all controls and links. Operating-system popup arrow navigation is not claimed by the headless tests.

## Labels, announcements, layout and contrast

The tests check that every visible interactive element has an accessible name, IDs are unique, and every `aria-labelledby`, `aria-describedby`, `aria-controls`, and label `for` reference resolves. Blank state/column labels use their existing binding/key fallbacks. Table headers have column scope; charts expose a name and text summary. Existing progressive-table tests also verify keyboard scrolling, row counts, status updates and focus on the first newly revealed row.

Field errors retain alert semantics and their input-description association. File errors retain a named alert and receive focus. The unsaved indicator retains its polite, atomic live region. These checks verify DOM semantics and accessibility-tree output, not actual spoken screen-reader announcements.

Preview and Source pass reflow checks at **320 CSS pixels with 200% root text sizing**. This is a text-resize test, not browser-zoom certification. Wide tables, Source and code blocks scroll within their own containers. The broader suite also checks 375- and 1280-pixel layouts. Screenshots are generated for invalid-state feedback, reopened documents, and enlarged text.

Computed contrast is checked across all **12 combinations** of light/dark mode, blue/teal/amber accent and comfortable/compact density in both engines. Minimum measured ratios across those combinations were:

| Pair                      | Minimum ratio |
| ------------------------- | ------------: |
| Field text/background     |       13.50:1 |
| Field border/background   |        3.77:1 |
| Focus outline/background  |        6.68:1 |
| Primary button text/fill  |        6.30:1 |
| Markdown link/sheet       |        6.68:1 |
| Muted chart summary/sheet |        6.31:1 |
| Error text/sheet          |        7.59:1 |

The assertions require at least 4.5:1 for sampled text and 3:1 for sampled borders/focus indicators. These are targeted theme checks, not a comprehensive WCAG audit of every rendered document.

## Verification and evidence

- `npm run check`: **581 unit/integration tests across 25 files**, strict TypeScript, ESLint, formatting, reference-demo validation and production build passed.
- `./node_modules/.bin/playwright test`: **66 browser tests passed**, including the existing security, error recovery, editing, download, unsaved-replacement and complete-workflow suites.
- This step adds **9 unit/component cases** and **12 browser cases**. [accessibility.test.tsx](../tests/accessibility.test.tsx) covers focus restoration and avoiding focus theft; the Markdown suite covers empty links and retained named links.
- Production JavaScript is **513.31 kB minified / 155.82 kB gzip**. The existing Vite chunk warning remains. No runtime performance improvement is claimed.

Run the focused checks:

```sh
npm test -- tests/accessibility.test.tsx tests/markdown.test.tsx
npm run test:viewer -- tests/browser/accessibility.spec.ts
```

Run the complete verification:

```sh
npm run check
./node_modules/.bin/playwright test
```

The ignored `test-results/` directories contain screenshots, actual `.mosa` downloads, `accessibility-tree.yml`, `workflow-results.json`, and `contrast-results.json`. Workflow exports were byte-identical between engines: **3,210 bytes** for the light fixture and **3,205 bytes** for the dark fixture. Subsequent Playwright runs can replace these artifacts.

The tested targets are the two Playwright engines above. Branded Safari/Chrome, Firefox, physical mobile browsers, operating-system file-dialog navigation, and actual VoiceOver/NVDA speech were not manually verified. This establishes the v0.1 keyboard and semantic-HTML smoke coverage; it is not a full accessibility certification. Production benchmarks and final release reporting remain separate Phase 5 work.
