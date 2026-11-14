declare const jsonPointerBrand: unique symbol;

/** RFC 6901 string form, not a URI fragment. Construct with the helpers below. */
export type JsonPointer = string & { readonly [jsonPointerBrand]: true };

/** The whole document. `/` instead identifies a property with an empty name. */
export const ROOT_POINTER = '' as JsonPointer;

/** Check syntax only; the referenced property need not exist in a document. */
export function isJsonPointer(value: unknown): value is JsonPointer {
  return (
    typeof value === 'string' &&
    (value === '' || value.startsWith('/')) &&
    !/~(?:[^01]|$)/u.test(value)
  );
}

/** Append one raw property name or zero-based array index without decoding the parent. */
export function appendJsonPointer(parent: JsonPointer, token: string | number): JsonPointer {
  if (typeof token === 'number' && (!Number.isSafeInteger(token) || token < 0)) {
    throw new RangeError('A numeric JSON Pointer token must be a non-negative safe integer.');
  }

  // Escape tildes first so the slash escape is not escaped a second time.
  const escaped = String(token).replaceAll('~', '~0').replaceAll('/', '~1');
  return `${parent}/${escaped}` as JsonPointer;
}

/** Build a pointer from raw tokens. No tokens means the whole document. */
export function jsonPointer(...tokens: readonly (string | number)[]): JsonPointer {
  let pointer = ROOT_POINTER;
  for (const token of tokens) pointer = appendJsonPointer(pointer, token);
  return pointer;
}
