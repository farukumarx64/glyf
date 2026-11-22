import { useState, type KeyboardEvent } from 'react';
import type { ParseResult } from '../core/errors.ts';
import type { GlyfScalar } from '../core/types.ts';

// Parse the complete decimal spelling, including signs and exponents.
const decimalNumber = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u;

/** Keep draft spelling and errors local while publishing only accepted values. */
export function useValueDraft(value: GlyfScalar, update: (next: GlyfScalar) => ParseResult) {
  const [draft, setDraft] = useState({ committed: value, text: String(value ?? ''), error: '' });
  // Follow a change from another bound control without resetting unrelated drafts.
  if (!Object.is(draft.committed, value)) {
    setDraft({ committed: value, text: String(value ?? ''), error: '' });
  }

  function commit(next: GlyfScalar, text = String(next ?? '')) {
    const result = update(next);
    setDraft({
      committed: result.ok ? next : value,
      text,
      error: result.ok ? '' : result.errors[0].message,
    });
  }

  function changeNumber(text: string, message = 'Enter a finite decimal number.') {
    const trimmed = text.trim();
    const number = Number(trimmed);
    if (!decimalNumber.test(trimmed) || !Number.isFinite(number)) {
      setDraft({ committed: value, text, error: message });
      return;
    }
    commit(number, text);
  }

  function restore(event: KeyboardEvent) {
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      setDraft({ committed: value, text: String(value ?? ''), error: '' });
    }
  }

  function normalize() {
    if (!draft.error) setDraft({ committed: value, text: String(value ?? ''), error: '' });
  }

  return { text: draft.text, error: draft.error, commit, changeNumber, restore, normalize };
}
