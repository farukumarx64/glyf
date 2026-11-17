import { useId } from 'react';
import type { DocumentStore } from '../core/store.ts';
import type { ColumnDefinition, MosaicScalar } from '../core/types.ts';

import { useValueDraft } from './useValueDraft.ts';

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
  const draft = useValueDraft(value, (next) => updateCell(tableId, rowId, column.key, next));

  function change(text: string) {
    if (column.kind === 'number') {
      draft.changeNumber(text, 'Enter a finite decimal number, or choose No value.');
    } else if (column.kind === 'boolean') {
      draft.commit(text === '' ? null : text === 'true', text);
    } else {
      draft.commit(text, text);
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
          onKeyDown={draft.restore}
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
              onKeyDown={draft.restore}
            />
          ) : (
            <input
              {...accessibility}
              type="text"
              inputMode="decimal"
              value={draft.text}
              placeholder={value === null ? 'No value' : undefined}
              onChange={(event) => change(event.currentTarget.value)}
              onKeyDown={draft.restore}
              onBlur={draft.normalize}
            />
          )}
          <button
            type="button"
            aria-label={`Set ${label} to no value`}
            onClick={() => draft.commit(null)}
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
