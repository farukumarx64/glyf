# Core error and resource contracts

**Scope:** Phase 1, step 1 — shared definitions and diagnostic helpers, implemented on 2026-11-14. Parsing, decoding, duplicate-key detection, tree traversal, semantic validation, and serialization remain subsequent steps. These modules do not validate a whole document.

## Structured errors and results

`src/core/errors.ts` defines the public diagnostic shape:

```ts
interface MosaicError {
  readonly code: MosaicErrorCode;
  readonly path: JsonPointer;
  readonly message: string;
}
```

- `code` is a literal union derived from the frozen ten-code `MOSAIC_ERROR_CODES` catalog. Callers branch on it, not on message text.
- `path` is an RFC 6901 string-form JSON Pointer. It remains a plain string at runtime and in serialized JSON.
- `message` is a human-readable explanation. Future validators must supply useful, non-empty messages; their wording is not an API discriminator.
- Diagnostics contain no document copies, stack traces, or Ajv-specific objects.

The future parser and full validator share this result contract:

```ts
type ParseResult =
  | { readonly ok: true; readonly document: MosaicDocument }
  | { readonly ok: false; readonly errors: readonly [MosaicError, ...MosaicError[]] };
```

Checking `ok` narrows the result to success or failure. The failure tuple requires at least one error at compile time. Fields and lists are readonly in TypeScript, without deep-freezing every diagnostic at runtime. The schema-only development tool must not return a successful `ParseResult`: structural validation alone does not establish semantic validity.

## Error classification

The following defines how subsequent implementations will use the specification's existing codes. This step implements the catalog and resource-error helper, not all the detectors listed here.

| Code                  | Use                                                                                                                                                                      | Typical path                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `FILE_TOO_LARGE`      | Raw input, public-parser UTF-8 text size, or serialized output exceeds 5 MiB.                                                                                            | `""`                                                       |
| `INVALID_UTF8`        | Bytes cannot be decoded as strict UTF-8.                                                                                                                                 | `""`                                                       |
| `INVALID_JSON`        | Malformed JSON or duplicate object property names in source text.                                                                                                        | `""` for syntax errors; the duplicate property when known. |
| `UNSUPPORTED_VERSION` | A present string `mosaic` value differs from `"0.1.0"`.                                                                                                                  | `/mosaic`                                                  |
| `SCHEMA_ERROR`        | Structural violations, unknown fields/types, invalid scalar values, or non-JSON in-memory structure such as a cycle. Missing or non-string versions belong here.         | The offending property or object.                          |
| `DUPLICATE_ID`        | Repeated node IDs globally, or repeated row IDs within one dataset.                                                                                                      | The later occurrence's `/id`.                              |
| `INVALID_ROOT`        | A structurally valid root node is not a permitted layout node.                                                                                                           | `/root/type`                                               |
| `INVALID_BINDING`     | Missing/incompatible state references, or reserved state keys and references.                                                                                            | The binding or state property.                             |
| `INVALID_DATASET`     | Invalid dataset references, reserved dataset/column identifiers, duplicate column keys, incomplete/extra row cells, cell-kind mismatches, or incompatible chart columns. | The dataset, row cell, or node reference.                  |
| `RESOURCE_LIMIT`      | Any of the other nine published safety ceilings is exceeded.                                                                                                             | The affected subtree, collection, node, or field.          |

Use the code from the first applicable validation stage; later stages need not run after a failure. For example, the schema-level rejection of a column key named `id` is `SCHEMA_ERROR`, while a cross-field cell-kind mismatch is `INVALID_DATASET`. Duplicate row IDs use `DUPLICATE_ID`, not the more general dataset code.

When later schema-error adapters identify a published safety ceiling, normalize it to `RESOURCE_LIMIT` regardless of the enforcement layer. Other structural bounds, such as heading length or allowed grid-column values, remain `SCHEMA_ERROR`. This is a classification convention for the future full validator; the existing schema-only development tool still reports Ajv diagnostics.

## JSON Pointer paths

`src/core/json-pointer.ts` provides:

- `ROOT_POINTER`: the empty string, identifying the whole document.
- `jsonPointer(...tokens)`: constructs a pointer from raw property names or array indices.
- `appendJsonPointer(parent, token)`: extends a constructed or checked pointer by one raw token.
- `isJsonPointer(value)`: checks syntax and narrows the value to `JsonPointer`.

```ts
jsonPointer(); // "" — the whole document
jsonPointer(''); // "/" — a property whose name is empty
jsonPointer('root', 'children', 2, 'bind'); // "/root/children/2/bind"
jsonPointer('state', 'a/b~c'); // "/state/a~1b~0c"
```

Array indices are zero-based. Within each token, `~` becomes `~0` and `/` becomes `~1`. Escape tildes first so newly generated slash escapes are not escaped again. Do not URI-encode paths, prepend `#`, normalize Unicode, or interpolate raw property names into slash-separated strings. Even invalid document keys need accurate error locations.

The branded `JsonPointer` type adds no runtime wrapper and prevents ordinary unchecked strings from being assigned as diagnostic paths in TypeScript. Construct paths with the helpers or check existing strings with `isJsonPointer`. The guard checks syntax, not existence: an error can legitimately point to a missing required field.

These helpers never read or write document properties. Negative, fractional, non-finite, or unsafe numeric indices throw `RangeError` as programmer misuse. String property names such as `"01"` remain valid tokens.

The escaping and root conventions follow [RFC 6901](https://www.rfc-editor.org/rfc/rfc6901.html#section-3).

## Resource ceilings and counting rules

`src/core/limits.ts` exports the frozen `MOSAIC_LIMITS` object, the `MosaicResource` key union, and `ROOT_NODE_DEPTH = 1`. Budgets are fixed for v0.1 and must not be overridden by document content.

| Key                  | Inclusive maximum | Measurement rule                                                                                                |
| -------------------- | ----------------: | --------------------------------------------------------------------------------------------------------------- |
| `fileBytes`          |         5,242,880 | Actual UTF-8 bytes. Include an import BOM if present and formatting plus the final newline on export.           |
| `nodes`              |             2,000 | Root plus every descendant, including hidden conditional content.                                               |
| `treeDepth`          |                20 | Root is level 1; each child adds one. JSON object/array wrappers do not add node levels.                        |
| `datasets`           |                20 | Named datasets.                                                                                                 |
| `columnsPerDataset`  |                30 | Declared columns in each dataset.                                                                               |
| `rowsPerDataset`     |             1,000 | Rows in each dataset.                                                                                           |
| `totalCells`         |            20,000 | Sum `rows × declared columns` across datasets; include null cells and exclude row IDs.                          |
| `chartPoints`        |               500 | Per chart, count rows with both selected values non-null. Numeric zero and empty labels are not missing values. |
| `markdownCharacters` |            20,000 | Unicode code points per Markdown string, matching JSON Schema `maxLength`.                                      |
| `stateKeys`          |               100 | Persistent state properties.                                                                                    |

For example, 100 rows with three declared columns use 300 cells, even if some are null. Their 100 row IDs do not increase that count. Chart counts are independent of table row counts and of other charts.

The Markdown limit counts code points, not UTF-8 bytes, JavaScript UTF-16 code units, or displayed grapheme clusters. A supplementary-plane character such as `😀` counts once, even though JavaScript's `.length` counts two code units. This follows [JSON Schema string-length semantics](https://json-schema.org/draft/2020-12/json-schema-validation#name-maxlength).

Tests check every corresponding schema ceiling against the constants. The core does not import the entire schema to obtain a few numbers. The schema's per-`children` array ceiling is also checked, but cannot replace the future global node-count traversal.

## Shared limit diagnostics

`checkResourceLimit(resource, measuredCount, path)` compares an already measured count:

```ts
checkResourceLimit('nodes', 2000, jsonPointer('root')); // undefined: within budget

checkResourceLimit('nodes', 2001, jsonPointer('root'));
// {
//   code: 'RESOURCE_LIMIT',
//   path: '/root',
//   message: 'Document node count exceeds the limit of 2000 (received 2001).'
// }
```

- Exactly the maximum is allowed. Only a greater count produces a diagnostic.
- File-byte violations use `FILE_TOO_LARGE`; other safety ceilings use `RESOURCE_LIMIT`.
- Callers supply the location. Use `ROOT_POINTER` for file-wide or aggregate errors when no narrower location is appropriate.
- Messages include the resource, ceiling, and observed count.
- Invalid counts (negative, fractional, non-finite, or outside the safe-integer range) throw `RangeError` to expose a caller bug. This restriction applies to counters, not numeric document cells or state values.
- This helper checks upper bounds only. Zero may be within budget while violating another schema rule, such as the minimum of one dataset column.

The helper does not count nodes, traverse datasets, measure bytes/strings, or select chart rows. Those operations belong to subsequent steps. It performs a fixed amount of comparison and diagnostic construction without copying or modifying documents.

## Verification scope

Tests cover pointer escaping, root/empty paths, Unicode and JSON-string round trips, malformed pointers, invalid numeric indices, readonly catalogs/budgets, typed error/result constraints, schema/constant agreement, exact and exceeded boundaries, invalid counters, and Unicode Markdown boundaries through the existing schema tool.

Hidden-node traversal, dataset/chart counting, decoding, byte measurement, duplicate detection, and semantic validation still need direct tests when implemented. No package dependencies are added by this step.

**Verified on 2026-11-14:** `npm run check` passed strict typechecking, ESLint, Prettier checks, 112 tests across four files (74 added in this step), reference-demo schema validation, and the production build.
