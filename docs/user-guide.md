# Mosaic user guide

This guide covers the current v0.1 local preview. Start the viewer using the [README setup instructions](../README.md#development-environment), then keep its browser tab open while you work. For startup or file errors, use [troubleshooting](troubleshooting.md).

## Try the demo

1. Choose **Open Demo**. The document contains a **Document note**, a **Show revenue chart** toggle, and a revenue table with Jan, Feb and Mar rows.
2. In the **Revenue (NGN)** column, change Jan from `1200` to `3000`. The chart updates immediately, and **Unsaved changes** appears beside the filename.
3. Change **Document note** to `My updated report`. The displayed current note updates as you type.
4. Turn **Show revenue chart** off. The chart disappears; its dataset remains in the document. Turn it on to see the edited values again, then leave it off for the save/reopen check below.
5. As an optional error check, replace Jan's number with `abc`. Feedback appears, but the accepted value remains `3000`. Press **Escape** while focused in that cell to restore `3000` and clear the draft error.
6. Select **Source** to inspect the current document. It includes the accepted number and note, and `showChart` is `false`. Source is read-only; return to Preview to edit controls.
7. Choose **Download** and let your browser save the `.mosa` file. The browser may add a suffix if a file with that name already exists. Check its downloads list or destination folder for completion.
8. Choose **Open File** and select the file you just downloaded. Jan should show `3000`, the note should say `My updated report`, and the chart should remain hidden until you turn its toggle on.

**Open Demo always opens the bundled starting example.** Use Open File to return to your downloaded edits. If you have made additional changes since downloading, cancel a replacement prompt and download those changes first if you want to keep them.

## Open and inspect a document

Choose **Open File** or drop **one file at a time** into the viewer. The file chooser filters for `.mosa`. The reader checks the document contents; changing another file's suffix does not convert it into Mosaic. A valid file must use the exact format version `0.1.0` and fit the limits below.

Opening a valid document selects **Preview**. If a replacement is invalid or unreadable, an error panel appears and your existing document, edits and selected tab remain available. Cancelling the chooser also leaves the current document intact. You can choose the same file again after correcting it.

**Source** displays the complete current document as formatted JSON, including accepted edits, hidden conditional content and table rows that have not been revealed yet. It excludes unfinished invalid drafts. Source is an inspection view, not a code editor. A Source view can be larger than the export limit after formatting; being able to inspect it does not guarantee that Download will succeed.

Tables with more than 100 rows initially show the first 100. Use **Show … more rows** to reveal the next batch; the status shows how many are visible. Hidden batches remain in the document and are included in downloads. Wide tables scroll horizontally, including on narrow screens.

## Edit values

Edits apply as soon as they are valid; there is no separate Apply button. Charts and other views of the same data update immediately. You can edit only controls supplied by the document. A table cell is editable only when both the table and that column allow editing; a plain text cell is read-only.

| Control                         | How to use it                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Text input or text cell         | Type text, including line breaks. An empty text cell is an empty string, which differs from No value.                                     |
| Numeric input or cell           | Enter a finite decimal number, such as `3000`, `-12.5` or `1e3`. Use a period for decimals and no currency signs or thousands separators. |
| Boolean table cell              | Choose `true`, `false` or **No value** from its selector.                                                                                 |
| No value button in a table cell | Store a missing value (`null`). This differs from zero, false or empty text. A read-only missing cell displays an em dash.                |
| Toggle                          | Change an existing true/false setting. It may show or hide another part of the document.                                                  |

An invalid numeric draft, such as `abc`, `-`, an empty field or an overflowing number, shows feedback while leaving the last accepted value in the document. Correct it or press **Escape** in the field to restore the last accepted value. Moving focus away does not make an invalid draft valid. Numeric table cells have a No value option; ordinary numeric inputs do not.

Escape is not a document-wide undo command: accepted edits have already changed the document. There is no general undo/redo history. Reopen an earlier saved file to recover its values, keeping in mind that replacing the current document discards its undownloaded edits.

An edit can also be rejected because it would exceed a chart's point limit, even if that chart is currently hidden. In that case the error explains the rejected change and the last accepted value remains. Charts omit rows whose selected x or y value is No value; zero still counts as a plotted value. The author determines row order, chart type and data references.

## Download and reopen

Choose **Download** from Preview or Source. It is available after a document opens and is temporarily disabled while another file is being read. The download contains accepted table and control values, all rows, and hidden content. Invalid drafts are excluded.

Download creates a **new file** through the browser. It does not overwrite the original or write back to an earlier downloaded copy. The suggested filename keeps the opened name with a `.mosa` suffix; the browser controls the save location and any duplicate-name suffix. For example, an opened `report.MOSA` is suggested as `report.mosa`.

The exported document is UTF-8 JSON with two-space indentation, one final newline and no BOM. Its structure, array order and accepted values survive reopening; original whitespace and numeric spelling are not preserved. The final formatted file must fit **5 MiB (5,242,880 bytes)**. A compact input can fit on open but exceed this limit after formatting or edits. A failed download retains the document; see [export troubleshooting](troubleshooting.md#download-and-saving).

**Unsaved changes** means an accepted value has changed since opening or starting the last download. The label clears when a download starts, not when the browser proves the file reached disk. Check the download yourself. If you cancel the browser's save or cannot find the result, choose Download again. Identical edits and invalid drafts do not set the label; manually reverting an accepted edit does not automatically clear it.

Before replacing a changed document with Open Demo, Open File or a drop, the viewer asks whether to discard changes. **Cancel** keeps the current document and drafts. Accepting replaces them. An invalid incoming file does not cause replacement or a discard prompt.

**Download before refreshing, closing the tab or navigating away.** There is no autosave, session restore or warning for those actions. The browser tab holds the working document in memory. Hidden controls can be unmounted when their section disappears; keep only accepted edits in mind when saving, since local drafts are not saved document data.

## Keyboard and offline use

Use Tab and Shift+Tab to move among controls, Enter to activate buttons, and Space to toggle a focused checkbox. With Preview or Source focused, Left/Right switches tabs, Home selects Preview and End selects Source. Escape in an editable field restores its last accepted value. A table's scroll region can receive keyboard focus; revealing more rows moves focus to the first new row. Browser and operating-system keyboard settings affect which controls participate in Tab navigation.

Once the app assets have loaded, opening local files, editing, inspecting Source and downloading use local processing. No AI service, account or backend is needed. Allowed external links are opened only when you activate them and may require connectivity or launch your mail application. The app does not provide a cold-offline installer or service worker: loading a new tab or refreshing while the app server is unavailable is not a supported offline-start workflow. When testing offline behavior, use the production preview; the development server also has a live-reload connection.

## Known limitations

| Area                                   | Current scope                                                                                                                                                                                                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| File compatibility                     | Only exact format `0.1.0`. UTF-8 JSON is required; malformed JSON, duplicate properties and unsupported versions are rejected. No automatic migration or conversion from CSV, spreadsheets, PDF or other document formats.                                                                       |
| File and data size                     | Inclusive 5 MiB input/export limit; up to 1,000 rows and 30 columns per dataset, 20,000 cells across datasets and 500 plotted points per chart. Other node, state and Markdown limits also apply; see the [complete resource table](compatibility.md#fixed-resource-limits).                     |
| Authoring                              | Edit existing enabled cells and controls. Source is read-only. No visual layout editor, adding/deleting rows, creating state keys, formulas, arbitrary scripts or general undo/redo.                                                                                                             |
| Numbers                                | JavaScript number precision applies; exact arbitrary-precision decimal storage is not promised. Export can normalize number spelling, including negative zero.                                                                                                                                   |
| Markdown and links                     | Raw HTML and images are disabled. Relative links and unsupported schemes are not active. Supported links are absolute HTTP(S), email links and valid document-node fragments. No full GitHub-flavored Markdown promise. Extreme nesting can show a readable source fallback.                     |
| Saving and offline startup             | Downloads must be completed by the browser; there is no autosave/reload recovery. Offline use starts after assets load. Direct `file://` startup is unsupported.                                                                                                                                 |
| Browser and accessibility verification | Automated Chromium/WebKit workflows on macOS and Ubuntu CI, plus a separate installed-Brave run, are recorded. This is not certification for every browser or physical mobile device. Native dialogs and actual screen-reader output still need manual checks; Windows setup remains unverified. |
| Performance and long sessions          | Large/complex files can take longer, particularly on smaller devices. Memory stability after many replacements remains unconfirmed. Save your work before restarting the tab if the session becomes sluggish.                                                                                    |

This is local evaluation documentation. Public naming and `.mosa` extension review remain open in [release readiness](release-readiness.md); no public release is declared here. For technical format rules, use the [compatibility contract](compatibility.md).
