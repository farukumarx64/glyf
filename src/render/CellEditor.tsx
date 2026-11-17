import { useId, useState, type KeyboardEvent } from 'react';
import type { DocumentStore } from '../core/store.ts';
import type { ColumnDefinition, MosaicScalar } from '../core/types.ts';

// Parse user-entered decimal notation completely, including signs and exponents.
const decimalNumber = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u;

export function CellEditor({
  tableId,
  rowId,
  column,
  value,
  updateCell,
}: {
  tableId: string;
  rowId: string;
  column: ColumnDefinition;
  value: MosaicScalar;
  updateCell: DocumentStore['updateCell'];
}) {
  const errorId = useId();
  const label = `${column.label.trim() ? column.label : column.key}, row ${rowId}`;
  const [draft, setDraft] = useState({
    committed: value,
    text: String(value ?? ''),
    error: '',
  });

  // Another view can edit this same cell. Follow that value without resetting
  // local drafts when an unrelated row or column changes.
  if (!Object.is(draft.committed, value)) {
    setDraft({ committed: value, text: String(value ?? ''), error: '' });
  }

  function commit(next: MosaicScalar, text: string) {
    const result = updateCell(tableId, rowId, column.key, next);
    setDraft({
      committed: result.ok ? next : value,
      text,
      error: result.ok ? '' : result.errors[0].message,
    });
  }

  function change(text: string) {
    if (column.kind === 'number') {
      const trimmed = text.trim();
      const number = Number(trimmed);
      if (!decimalNumber.test(trimmed) || !Number.isFinite(number)) {
        setDraft({
          committed: value,
          text,
          error: 'Enter a finite decimal number, or choose No value.',
        });
        return;
      }
      commit(number, text);
    } else if (column.kind === 'boolean') {
      commit(text === '' ? null : text === 'true', text);
    } else {
      commit(text, text);
    }
  }

  function restore(event: KeyboardEvent) {
    if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      setDraft({ committed: value, text: String(value ?? ''), error: '' });
    }
  }

  const accessibility = {
    'aria-label': label,
    'aria-invalid': draft.error ? true : undefined,
    'aria-describedby': draft.error ? errorId : undefined,
  } as const;

  return (
    <div className="mosaic-cell-editor">
      {column.kind === 'boolean' ? (
        <select
          {...accessibility}
          value={draft.text}
          onChange={(event) => change(event.currentTarget.value)}
          onKeyDown={restore}
        >
          <option value="">No value</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      ) : (
        <>
          {column.kind === 'string' ? (
            <textarea
              {...accessibility}
              rows={1}
              value={draft.text}
              placeholder={value === null ? 'No value' : undefined}
              onChange={(event) => change(event.currentTarget.value)}
              onKeyDown={restore}
            />
          ) : (
            <input
              {...accessibility}
              type="text"
              inputMode="decimal"
              value={draft.text}
              placeholder={value === null ? 'No value' : undefined}
              onChange={(event) => change(event.currentTarget.value)}
              onKeyDown={restore}
              onBlur={() => {
                if (!draft.error)
                  setDraft({ committed: value, text: String(value ?? ''), error: '' });
              }}
            />
          )}
          <button
            type="button"
            aria-label={`Set ${label} to no value`}
            onClick={() => commit(null, '')}
          >
            No value
          </button>
        </>
      )}
      {draft.error && (
        <p id={errorId} className="mosaic-cell-error" role="alert">
          {draft.error}
        </p>
      )}
    </div>
  );
}
