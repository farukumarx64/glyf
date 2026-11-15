import type { MosaicError } from './errors.ts';
import { appendJsonPointer, ROOT_POINTER } from './json-pointer.ts';
import { checkResourceLimit, MOSAIC_LIMITS, ROOT_NODE_DEPTH } from './limits.ts';

type Role = 'document' | 'node' | 'children' | 'data';

interface Frame {
  value: object;
  role: Role;
  depth: number;
  /** Property used to enter this frame. The document has no incoming key. */
  key: string;
  keys: (string | symbol)[];
  next: number;
}

// Construct the path only when reporting a failure. This also works for deep,
// malformed data outside the node tree without storing every prefix.
function location(stack: readonly Frame[], key?: string) {
  let path = ROOT_POINTER;
  for (let i = 1; i < stack.length; i++) path = appendJsonPointer(path, stack[i]!.key);
  return key === undefined ? path : appendJsonPointer(path, key);
}

function isJsonContainer(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  const intrinsic = Array.isArray(value) ? Array : Object;
  if (prototype === null && intrinsic === Object) {
    // Raw JSON wrappers look like null-prototype records but stringify as a scalar.
    return !('isRawJSON' in JSON && typeof JSON.isRawJSON === 'function' && JSON.isRawJSON(value));
  }
  if (prototype === null || typeof prototype !== 'object') return false;
  // Native stringify consults inherited toJSON even on ordinary cross-realm
  // objects. Inspect the descriptor without running a getter or the method.
  if ('toJSON' in value && !Object.hasOwn(value, 'toJSON')) {
    for (let owner: object | null = prototype; owner; owner = Object.getPrototypeOf(owner)) {
      const hook = Object.getOwnPropertyDescriptor(owner, 'toJSON');
      if (hook) {
        if (!('value' in hook) || typeof hook.value === 'function') return false;
        break;
      }
    }
  }
  if (prototype === intrinsic.prototype) return true;
  // Plain records and arrays can come from another realm (such as an iframe).
  const constructor: unknown = Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value;
  return (
    typeof constructor === 'function' &&
    constructor.prototype === prototype &&
    Function.prototype.toString.call(constructor) === Function.prototype.toString.call(intrinsic)
  );
}

/** Inspect plain JSON data before passing it to the recursive schema validator. */
export function preflightMosaic(input: unknown): MosaicError | undefined {
  if (input === null || typeof input !== 'object') return;
  if (!isJsonContainer(input)) {
    return {
      code: 'SCHEMA_ERROR',
      path: ROOT_POINTER,
      message: 'Expected a JSON record or array.',
    };
  }

  const active = new WeakSet<object>([input]);
  // A completed data object cannot be part of a cycle. Node positions still
  // need to be visited each time, since their count and depth depend on the path.
  const completed = new WeakSet<object>();
  const stack: Frame[] = [
    {
      value: input,
      role: 'document',
      depth: 0,
      key: '',
      keys: Reflect.ownKeys(input),
      next: 0,
    },
  ];
  let nodes = 0;

  while (stack.length) {
    const frame = stack[stack.length - 1]!;
    const key = frame.keys[frame.next++];
    if (key === undefined) {
      active.delete(frame.value);
      completed.add(frame.value);
      stack.pop();
      continue;
    }
    if (typeof key === 'symbol') {
      return {
        code: 'SCHEMA_ERROR',
        path: location(stack),
        message: 'Expected string property names in JSON data.',
      };
    }
    if (Array.isArray(frame.value)) {
      // Ordinary own-key order is ascending indices, followed by length.
      // Holes could otherwise let schema validation read inherited array entries.
      const index = frame.next - 1;
      if (key === 'length' && index === frame.value.length) continue;
      if (key !== String(index) || index >= frame.value.length) {
        return {
          code: 'SCHEMA_ERROR',
          path: location(stack),
          message: 'Expected a dense JSON array with only indexed entries.',
        };
      }
    }

    const property = Object.getOwnPropertyDescriptor(frame.value, key)!;
    if (!('value' in property) || !property.enumerable) {
      return {
        code: 'SCHEMA_ERROR',
        path: location(stack, key),
        message: 'Expected an enumerable JSON data property.',
      };
    }
    const child: unknown = property.value;
    if (
      child === undefined ||
      typeof child === 'function' ||
      typeof child === 'bigint' ||
      typeof child === 'symbol'
    ) {
      return {
        code: 'SCHEMA_ERROR',
        path: location(stack, key),
        message: 'Expected a JSON value.',
      };
    }
    if (child !== null && typeof child === 'object' && active.has(child)) {
      return {
        code: 'SCHEMA_ERROR',
        path: location(stack, key),
        message: 'Circular reference to an ancestor in the document.',
      };
    }

    let role: Role = 'data';
    let depth = 0;
    if ((frame.role === 'document' && key === 'root') || frame.role === 'children') {
      role = 'node';
      depth = frame.role === 'document' ? ROOT_NODE_DEPTH : frame.depth + 1;
      nodes++;
      if (depth > MOSAIC_LIMITS.treeDepth)
        return checkResourceLimit('treeDepth', depth, location(stack, key));
      if (nodes > MOSAIC_LIMITS.nodes)
        return checkResourceLimit('nodes', nodes, location(stack, key));
    } else if (frame.role === 'node' && key === 'children' && Array.isArray(child)) {
      role = 'children';
      depth = frame.depth;
      // Every slot is a node position. Reject obviously oversized lists before
      // enumerating them, including sparse arrays supplied by JavaScript.
      const minimumTotal = nodes + child.length;
      if (minimumTotal > MOSAIC_LIMITS.nodes)
        return checkResourceLimit('nodes', minimumTotal, location(stack, key));
    }
    if (child === null || typeof child !== 'object') continue;
    if (role === 'data' && completed.has(child)) continue;
    if (!isJsonContainer(child)) {
      return {
        code: 'SCHEMA_ERROR',
        path: location(stack, key),
        message: 'Expected a JSON record or array.',
      };
    }
    active.add(child);
    stack.push({ value: child, role, depth, key, keys: Reflect.ownKeys(child), next: 0 });
  }
}
