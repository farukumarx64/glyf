import { describe, expect, it } from 'vitest';
import {
  appendJsonPointer,
  isJsonPointer,
  jsonPointer,
  ROOT_POINTER,
} from '../src/core/json-pointer.ts';

describe('JSON Pointer diagnostic paths', () => {
  it('distinguishes the whole document from an empty property name', () => {
    expect(jsonPointer()).toBe('');
    expect(ROOT_POINTER).toBe('');
    expect(jsonPointer('')).toBe('/');
  });

  it('addresses a nested node property using a zero-based array index', () => {
    expect(jsonPointer('root', 'children', 2, 'bind')).toBe('/root/children/2/bind');
  });

  it.each([
    ['a/b', '/a~1b'],
    ['m~n', '/m~0n'],
    ['~1', '/~01'],
    ['/~', '/~1~0'],
    ['雪', '/雪'],
    ['a b', '/a b'],
    ['%', '/%'],
    ['a"b', '/a"b'],
    ['a\\b', '/a\\b'],
    ['\u0000', '/\u0000'],
    ['01', '/01'],
  ])('escapes raw token %j without URI encoding or normalization', (token, expected) => {
    const pointer = jsonPointer(token);
    expect(pointer).toBe(expected);
    expect(isJsonPointer(pointer)).toBe(true);
  });

  it('appends to an escaped parent without double-escaping it', () => {
    const parent = jsonPointer('datasets', 'bad/name');
    expect(appendJsonPointer(parent, 'a~b')).toBe('/datasets/bad~1name/a~0b');
    expect(parent).toBe('/datasets/bad~1name');
  });

  it.each(['', '/', '//', '/root/children/0', '/~0', '/~1', '/~01', '/a#b'])(
    'accepts valid string-form pointer %j',
    (pointer) => {
      expect(isJsonPointer(pointer)).toBe(true);
    },
  );

  it.each(['root', '#/root', '/~', '/~2', '/a~b', null, undefined, 0, {}])(
    'rejects invalid pointer %j',
    (pointer) => {
      expect(isJsonPointer(pointer)).toBe(false);
    },
  );

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid numeric index %s',
    (index) => {
      expect(() => jsonPointer('root', 'children', index)).toThrow(RangeError);
    },
  );

  it('keeps canonically distinct Unicode property names distinct', () => {
    expect(jsonPointer('\u00e9')).not.toBe(jsonPointer('e\u0301'));
  });

  it('survives JSON serialization with quotes, backslashes, and control characters', () => {
    const pointer = jsonPointer('a"b\\c\u0000', 0);
    expect(JSON.parse(JSON.stringify(pointer))).toBe(pointer);
  });
});
