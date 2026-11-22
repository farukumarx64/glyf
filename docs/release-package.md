# Glyf viewer candidate package

This package is for local evaluation of app **0.1.0-rc.3**. It reads document format **0.1.0** only. Glyf uses the tagline **One format. Infinite expressions.** Open and download `.glyf` files with the required `"glyf": "0.1.0"` marker. Documents produced by rc.1/rc.2 use the obsolete `mosaic` field and are rejected; there is no automatic migration. Read `RELEASE-NOTES.md` before evaluating; public release remains uncleared.

## Verify and extract

Keep the archive, its adjacent manifest and `SHA256SUMS` in one directory. On macOS:

```sh
shasum -a 256 -c SHA256SUMS
tar -xzf glyf-viewer-0.1.0-rc.3.tar.gz
cd glyf-viewer-0.1.0-rc.3
shasum -a 256 -c SHA256SUMS
```

On Linux, use `sha256sum -c SHA256SUMS` for both checks. Other systems can use an archive extractor and SHA-256 utility. The outer checksums cover the compressed archive and adjacent manifest; the inner checksums cover every payload file, including the internal manifest, except `SHA256SUMS` itself. The manifests are byte-identical. A matching checksum establishes integrity against that checksum file, not the publisher's identity; no signing key or signature is supplied.

## Serve the viewer

Serve **only the contents of `site/`** as the root of an HTTP(S) origin. Keep `index.html`, `assets/` and `THIRD_PARTY_LICENSES.md` together. The built asset URLs begin with `/assets/`; mounting this unchanged candidate below a URL subdirectory is unsupported. Opening the HTML directly with `file://` is unsupported.

For local evaluation, if Python 3 is already installed, run this from the extracted package directory:

```sh
python3 -m http.server 4180 --bind 127.0.0.1 --directory site
```

Open `http://127.0.0.1:4180`, choose **Open Demo**, and leave the server running. Ctrl+C stops it. Python is an optional local server, not an application or build dependency. A source checkout with installed dependencies can alternatively preview the extracted files using `bun run preview --outDir /absolute/path/to/extracted/site --port 4180 --strictPort`.

Use any suitable static HTTP(S) host for an approved deployment. It must return HTML, JavaScript and CSS with their corresponding content types; asset requests must not fall back to `index.html`. Revalidate `index.html` when replacing a build; hashed assets can use a long cache lifetime. Update the complete directory as one release so HTML and assets agree. There is no backend, server-side rendering or application routing to configure. Public deployment is a separate action.

The production browser tests cover this response header on the HTML document:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'
```

It permits the viewer's inline layout/theme styles and excludes inline scripts and string evaluation. Configure headers on the host; the archive does not configure them automatically, and Python's basic server does not add this policy. Other host policies require their own checks.

## First evaluation

1. Open Demo. Change January revenue from `1200` to `3000`; its chart and Source should update.
2. Change Document note and turn off Show revenue chart. The current note changes and the chart disappears.
3. Choose Download and confirm the browser completed the save. Open the saved `.glyf` file and verify those values and the hidden chart persist.
4. After the page has loaded, repeat editing/download/reopen with the network disconnected. Keep the tab open; refreshing or closing loses the in-memory document. Cold-offline startup is not provided.

Choose Open File or drop the supplied `glyf-demo.glyf` to exercise file reading. Invalid files show an error while retaining the currently open document. Source is read-only. The JSON schema describes structure; full acceptance also requires Glyf's semantic validation and resource checks.

## Contents and provenance

- `site/`: complete static viewer plus Vite-generated notices for its bundled dependencies.
- `AJV-LICENSE.txt`: license for the Ajv helper embedded in the precompiled validator, which the final app bundler cannot attribute automatically.
- `glyf-demo.glyf` and `glyf-v0.1.schema.json`: current Glyf golden fixture and authoritative working schema.
- `manifest.json`: app/format/toolchain versions, version-field name and file extension, lockfile and source-input digests, payload byte counts and hashes. It excludes itself and `SHA256SUMS` from its payload list to avoid circular hashes.
- `SOURCE-FILES.json`: sorted fingerprints of the explicitly selected build/package inputs. It does not contain source code or claim to fingerprint the entire repository, test evidence or Git history.

No clock time, checkout path, user identity or Git working-tree status is embedded. Archive entries use sorted names, fixed permissions/ownership and an epoch timestamp. Reproduction requires the same input bytes and pinned Node/Bun toolchain; the repository documents the measured platform scope. Source files and installed dependencies are not part of this viewer archive.
