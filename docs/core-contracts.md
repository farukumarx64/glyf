# Core error and resource contracts

The core reads local sources, validates them through iterative resource preflight, the Draft 2020-12 schema, and the v0.1 semantic rules, and serializes the current document for export.

## Reading a source

| Entry point               | Input                              | Return value            |
| ------------------------- | ---------------------------------- | ----------------------- |
| `readMosaicFile(file)`    | Browser `File` or `Blob`           | `Promise<SourceResult>` |
| `parseMosaicBytes(bytes)` | `Uint8Array`, including a subarray | `SourceResult`          |
| `parseMosaicText(text)`   | JavaScript string                  | `SourceResult`          |

Success carries `{ ok: true, value: unknown }`. The reader has established that the source contains one JSON object with its own `mosaic` string set to `"0.1.0"`. The value still needs node-tree preflight, schema validation and semantic validation before a renderer can treat it as a `MosaicDocument`. Content failures carry the existing non-empty `errors` list. An operating-system failure reading a file rejects the promise so callers can handle I/O separately.

The file reader checks `Blob.size` before `arrayBuffer()`. The byte parser checks the actual view length before strict UTF-8 decoding. The text parser measures UTF-8 length without allocating another full buffer and stops when the limit is exceeded. A raw unpaired UTF-16 surrogate in supplied text is an encoding error. A literal JSON escape such as `\uD800` consists of ASCII source characters and follows JSON string decoding rules.

The 5 MiB limit includes the optional three-byte UTF-8 BOM. The parser consumes one U+FEFF only at the start. A second BOM or one after whitespace causes a syntax error. U+FEFF inside a quoted value remains data.

Before the whole-document `JSON.parse`, an iterative token scanner tracks decoded member names per open object. It skips string values and releases each object's set when the object closes. A repeated member returns `INVALID_JSON` at its escaped JSON Pointer, including any enclosing array indices. Reusing a name in sibling objects is valid.

The scanner bounds its own stack at 41 open JSON containers. Every valid v0.1 path fits within one document object plus at most 20 node objects and 20 children arrays. An input beyond this ceiling returns `RESOURCE_LIMIT` before further nesting can allocate scanner frames. The validation API checks Mosaic node depth and total node count after parsing.

## Validating an in-memory value

Call `validateMosaic(value)` from `src/core/validate.ts` with a parsed value or a JSON-shaped JavaScript object. The reference command passes the successful file reader's `source.value` to this function. Use `parseMosaic(text)` from `src/core/parse.ts` to read and validate a source string in one call. Both functions return `ParseResult`. Success includes the checked document. Direct validation returns the original object and leaves it untouched. Validation reports the first failure and attaches its JSON Pointer. Each call checks the current values, including any edits made since a prior call.

Preflight walks the input using an explicit stack. Only `root` and entries in a node's `children` array are candidate node positions. The root counts once at depth 1. Each child adds one node and one level below its parent, including children of hidden `when` nodes. Metadata, rows and state consume no node positions. A failure returns `RESOURCE_LIMIT` with the offending node pointer. If the length of a child list already proves that the total exceeds 2,000, the error points to that list and gives the minimum known total. A document with a root and 1,999 leaf children fits exactly.

The same walk inspects object references throughout the input, including arrays and unknown fields. An edge back to an object on the active path produces `SCHEMA_ERROR` at that edge. For example, if `root.children[0]` refers to `root`, the pointer is `/root/children/0`. A completed object shared by siblings is acyclic. Preflight revisits shared node positions to account for each occurrence and its actual depth. It can skip previously checked objects in ordinary data fields. Each validation call has its own traversal state.

For direct calls, use JSON scalars, dense arrays and plain records with enumerable string-keyed data properties. Null-prototype records are supported. Class instances, custom prototypes and explicit `undefined` values fail the structural checks. Preflight uses property descriptors to inspect own values. It rejects own getters, setters, hidden properties, symbol keys, and extra array properties.

## Semantic validation

- The root must be a `column`, `row`, `grid`, or `card`. Visit nodes in document order, including every child of a `when`. A repeated ID points to the later node’s `id`. Document and row IDs have separate scopes.
- Dataset names, state keys, column keys, and references to them reserve `__proto__`, `prototype`, and `constructor`. Ordinary text can contain these words. References resolve to declared entries using maps and own-property checks.
- Each dataset has unique column keys and row IDs. A row must contain its own `id` and a cell for every declared column. Extra cells fail validation. A present `null` is valid in any column. Other cells must have the declared string, finite number, or boolean type.
- The cumulative cell count adds `rows × columns` for each dataset, including unused datasets. If it exceeds 20,000, the pointer identifies the row collection of the dataset that crosses the limit.
- A toggle binds to a boolean, a text input to a string, and a number input to a finite number. A `stateValue` or `when` can bind to any declared scalar, including `null`. A different scalar type in `when.equals` is valid and compares unequal under strict equality.
- Tables and charts require a declared dataset. Both chart axes must be columns in that dataset. The x column accepts strings or numbers and the y column requires numbers. The same numeric column can serve both axes. More than 500 rows with both selected values present and non-null produces `RESOURCE_LIMIT` at the chart, including for a hidden chart. Validation preserves dataset row order.

For example, a string `"12"` in a numeric column named `amount` in the first row of dataset `sales` returns `INVALID_DATASET` at `/datasets/sales/rows/0/amount`. Omitting the cell produces a missing-cell error at the same pointer. A cell containing `null` passes.

## Serializing a document

`serializeMosaic(document: MosaicDocument): string` in `src/core/serialize.ts` validates the current document on every call. Only format fields are accepted. Keep UI state such as the active selection outside the document model. A failure throws `MosaicSerializationError` from the same module. Its `errors` property holds the usual non-empty list of Mosaic diagnostics. Callers can inspect `errors[0].code` and `errors[0].path` and retain their working document for a retry.

Output matches `JSON.stringify(document, null, 2) + "\n"`. It starts with the opening brace and ends with one LF. Reopening preserves node, column, and row order, IDs, hidden content, optional fields, and committed cell and state values. JSON number spelling follows the native formatter, including writing JavaScript `-0` as `0`. A lone surrogate in a string is written as a JSON escape and recovered when parsed.

The inclusive limit is 5,242,880 UTF-8 bytes including indentation, escapes, and the final LF. Output of 5,242,881 bytes raises `FILE_TOO_LARGE` at the document pointer `""`. A compact input can open successfully and then need a smaller payload to fit the formatted export. A failed export leaves the current edits available. The formatter stops early if the cumulative string content alone proves that the output exceeds the budget. The finished text goes through the same allocation-free byte scan used by the text parser.

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

The text parser and in-memory validator share this result contract.

```ts
type ParseResult =
  | { readonly ok: true; readonly document: MosaicDocument }
  | { readonly ok: false; readonly errors: readonly [MosaicError, ...MosaicError[]] };
```

Checking `ok` narrows the result to success or failure. The failure tuple requires at least one error at compile time. Fields and lists are readonly in TypeScript, without deep-freezing every diagnostic at runtime. The schema-only development tool must not return a successful `ParseResult`: structural validation alone does not establish semantic validity.

## Error classification

The following table defines the error codes used throughout the source reader and validation stages.

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

The structural validation API reports published safety ceilings with `RESOURCE_LIMIT`. Other structural bounds, such as heading length or allowed grid-column values, remain `SCHEMA_ERROR`. The schema conformance helper retains the detailed Ajv diagnostics used by its tests.

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

Tests check every corresponding schema ceiling against the constants. The core does not import the entire schema to obtain a few numbers. The schema's per-`children` array ceiling is also checked, and the preflight sums node positions across the entire tree.

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

Callers supply the measured count. Byte measurement runs on input and on formatted export text. Preflight measures node count and depth. Dataset cell and chart point totals belong to the semantic stage.

## Verification scope

Tests cover pointer escaping, root/empty paths, Unicode and JSON-string round trips, malformed pointers, invalid numeric indices, readonly catalogs/budgets, typed error/result constraints, schema/constant agreement, exact and exceeded boundaries, invalid counters, and Unicode Markdown boundaries through the existing schema tool.

Parser tests exercise file reads, UTF-8 boundaries, BOMs, duplicate properties, syntax and version checks. Preflight tests exercise exact and exceeded limits, hidden branches, shared objects, and cycles in the document tree and surrounding data. Semantic tests exercise the typed success result, identity scopes, safe name resolution, row shape, control types, chart compatibility, and exact and exceeded cell and chart budgets.

Serialization tests cover the reference file round-trip, saved edits, invalid input, the specified formatting, and exact UTF-8 size boundaries.

**Step 1 verification on 2026-11-14:** `npm run check` passed strict typechecking, ESLint, Prettier checks, 112 tests across four files (74 added in this step), reference-demo schema validation, and the production build.
