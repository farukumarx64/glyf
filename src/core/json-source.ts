// This pass records names while they are still present in the source. JSON.parse
// handles the full JSON grammar and constructs the value after this pass succeeds.
import type { GlyfError } from './errors.ts';
import { appendJsonPointer, ROOT_POINTER } from './json-pointer.ts';
import { GLYF_LIMITS } from './limits.ts';

type Scope =
  { kind: 'object'; names: Set<string>; member: string } | { kind: 'array'; member: number };

// The document object contains at most 20 node objects and their 20 children
// arrays along any valid path. Dataset, state, theme, and meta paths are shorter.
// This bounds the scanner's own stack before the later node-tree preflight.
const maxOpenContainers = 1 + 2 * GLYF_LIMITS.treeDepth;

function memberPath(stack: readonly Scope[]) {
  let path = ROOT_POINTER;
  for (const scope of stack) path = appendJsonPointer(path, scope.member);
  return path;
}

function isJsonWhitespace(char: string | undefined): boolean {
  return char === ' ' || char === '\n' || char === '\r' || char === '\t';
}

export function checkJsonSource(text: string): GlyfError | undefined {
  const stack: Scope[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const scope = stack.at(-1);

    if (char === '{' || char === '[') {
      if (stack.length === maxOpenContainers) {
        return {
          code: 'RESOURCE_LIMIT',
          path: memberPath(stack),
          message: 'JSON containers are nested more deeply than a Glyf v0.1 document permits.',
        };
      }
      stack.push(
        char === '{'
          ? { kind: 'object', names: new Set(), member: '' }
          : { kind: 'array', member: 0 },
      );
    } else if (char === '}' || char === ']') {
      if (scope?.kind !== (char === '}' ? 'object' : 'array')) {
        return {
          code: 'INVALID_JSON',
          path: ROOT_POINTER,
          message: 'Unexpected closing JSON delimiter.',
        };
      }
      stack.pop();
    } else if (char === ',' && scope?.kind === 'array') {
      scope.member++;
    } else if (char === '"') {
      const start = i;
      let escaped = false;
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\') {
          escaped = true;
          i++; // Skip the escaped character, including an escaped quote or backslash.
        }
      }
      if (i >= text.length) {
        return { code: 'INVALID_JSON', path: ROOT_POINTER, message: 'Unterminated JSON string.' };
      }
      if (scope?.kind !== 'object') continue;
      let after = i + 1;
      while (isJsonWhitespace(text[after])) after++;
      if (text[after] !== ':') continue;

      // Only keys need decoding for equality. Leave value strings untouched.
      const name: string = escaped
        ? JSON.parse(text.slice(start, i + 1))
        : text.slice(start + 1, i);
      scope.member = name;
      if (scope.names.has(name)) {
        return {
          code: 'INVALID_JSON',
          path: memberPath(stack),
          message: 'This property is declared more than once in the same JSON object.',
        };
      }
      scope.names.add(name);
      i = after;
    }
  }
  return undefined;
}
