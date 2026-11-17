import { memo, useContext, useState } from 'react';
import type { ColumnDefinition, DatasetRow } from '../core/types.ts';
import type { DocumentStore } from '../core/store.ts';
import type { NodeView } from './nodeRegistry.tsx';
import { CellEditor } from './CellEditor.tsx';
import { CellEditingContext } from './cell-editing-context.ts';

const ROW_BATCH_SIZE = 100;

function focusRow(row: HTMLTableRowElement | null) {
  row?.focus();
}

const TableRow = memo(function TableRow({
  row,
  columns,
  ariaRowIndex,
  firstNewRow,
  tableId,
  updateCell,
}: {
  row: DatasetRow;
  columns: readonly ColumnDefinition[];
  ariaRowIndex: number | undefined;
  firstNewRow: boolean;
  tableId: string;
  updateCell: DocumentStore['updateCell'] | undefined;
}) {
  return (
    <tr
      aria-rowindex={ariaRowIndex}
      tabIndex={firstNewRow ? -1 : undefined}
      ref={firstNewRow ? focusRow : undefined}
    >
      {columns.map((column) => {
        const { key, kind } = column;
        const value = row[key]!;
        const editable =
          updateCell && Object.hasOwn(column, 'editable') && column.editable === true;
        return (
          <td
            key={key}
            data-kind={kind}
            aria-label={!editable && value === null ? 'No value' : undefined}
          >
            {editable ? (
              <CellEditor
                tableId={tableId}
                rowId={row.id}
                column={column}
                value={value}
                updateCell={updateCell}
              />
            ) : value === null ? (
              '—'
            ) : (
              String(value)
            )}
          </td>
        );
      })}
    </tr>
  );
});

export const TableView: NodeView<'table'> = ({ node, document, anchorId }) => {
  // Document validation resolves this binding and guarantees one cell per column.
  const { columns, rows } = document.datasets![node.dataset]!;
  const updateCell = useContext(CellEditingContext);
  const [batch, setBatch] = useState(1);
  const progressive = rows.length > ROW_BATCH_SIZE;
  const visibleCount = Math.min(rows.length, batch * ROW_BATCH_SIZE);
  const visibleRows = visibleCount === rows.length ? rows : rows.slice(0, visibleCount);
  const nextCount = Math.min(ROW_BATCH_SIZE, rows.length - visibleCount);

  return (
    <div className="mosaic-table-view">
      <div
        className="mosaic-table-scroll"
        role="group"
        aria-label={`${node.dataset} table`}
        tabIndex={0}
      >
        <table id={anchorId} aria-rowcount={progressive ? rows.length + 1 : undefined}>
          <caption>{node.dataset}</caption>
          <thead>
            <tr aria-rowindex={progressive ? 1 : undefined}>
              {columns.map((column) => (
                <th key={column.key} scope="col" data-kind={column.kind}>
                  {column.label.trim() ? column.label : column.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, i) => (
              <TableRow
                key={row.id}
                row={row}
                columns={columns}
                ariaRowIndex={progressive ? i + 2 : undefined}
                firstNewRow={batch > 1 && i === (batch - 1) * ROW_BATCH_SIZE}
                tableId={node.id}
                updateCell={
                  Object.hasOwn(node, 'editable') && node.editable === true ? updateCell : undefined
                }
              />
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p>No rows</p>}
      {progressive && (
        <div className="mosaic-table-progress">
          <span role="status">
            Showing {visibleCount} of {rows.length} rows
          </span>
          {nextCount > 0 && (
            <button
              type="button"
              aria-controls={anchorId}
              onClick={() => setBatch((current) => current + 1)}
            >
              Show {nextCount} more {nextCount === 1 ? 'row' : 'rows'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
