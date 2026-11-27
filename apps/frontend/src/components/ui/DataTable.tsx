import { ReactNode, useMemo } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';
import { CellValue, ColKind, ColSpec, ColumnHeader, TableFilterSummary, useTableControls } from './tableControls';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  /** The value sorted and filtered on (default: the row's field `key`). */
  value?: (row: T) => CellValue;
  kind?: ColKind;
  /** Default true. */
  sortable?: boolean;
  /** Default true. */
  filterable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  /** Keeps the sort and filters of this table for the session. */
  tableId?: string;
  pagination?: {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  loading,
  onEdit,
  onDelete,
  onRowClick,
  emptyMessage = 'Aucune donnée',
  tableId = 'table',
  pagination,
}: DataTableProps<T>) {
  // Sort and filter on every column (its value, or the row's field of the same name).
  const specs = useMemo<ColSpec<T>[]>(
    () =>
      columns.map((c) => ({
        key: c.key,
        label: c.header,
        value: c.value ?? ((row: T) => (row as Record<string, unknown>)[c.key] as CellValue),
        kind: c.kind,
        align: c.align === 'right' ? 'right' : 'left',
        sortable: c.sortable !== false,
        filterable: c.filterable !== false,
      })),
    [columns],
  );
  const ctl = useTableControls(tableId, data, specs);
  const rows = ctl.rows;
  const showActions = onEdit || onDelete;

  return (
    <div className="flex flex-col gap-3">
      <TableFilterSummary ctl={ctl} />
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-5 py-3 text-left text-[12px] font-semibold text-muted whitespace-nowrap',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    col.width && `w-[${col.width}]`,
                  )}
                >
                  <ColumnHeader ctl={ctl} col={col.key} />
                </th>
              ))}
              {showActions && (
                <th className="px-5 py-3 text-right text-[12px] font-semibold text-muted w-24">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((col) => (
                    <td key={col.key} className="px-5 py-4">
                      <div className="h-4 bg-surface-2 rounded" />
                    </td>
                  ))}
                  {showActions && (
                    <td className="px-5 py-4">
                      <div className="h-4 bg-surface-2 rounded ml-auto w-16" />
                    </td>
                  )}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (showActions ? 1 : 0)}
                  className="px-5 py-16 text-center text-muted"
                >
                  {data.length && ctl.activeCount ? 'Aucune ligne ne correspond aux filtres.' : emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'transition-colors duration-100 hover:bg-surface-2/50',
                    onRowClick && 'cursor-pointer',
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-5 py-3.5 text-ink',
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right',
                      )}
                    >
                      {col.render
                        ? col.render(row)
                        : String((row as any)[col.key] ?? '—')}
                    </td>
                  ))}
                  {showActions && (
                    <td className="px-5 py-3.5">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {onEdit && (
                          <button
                            onClick={() => onEdit(row)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 transition-colors"
                            aria-label="Modifier"
                          >
                            <Pencil size={14} />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(row)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                            aria-label="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={pagination.page === 1}
            onClick={() => pagination.onPageChange(pagination.page - 1)}
          >
            Précédent
          </Button>
          <span className="text-xs text-muted px-2 tabular">
            {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={pagination.page === pagination.totalPages}
            onClick={() => pagination.onPageChange(pagination.page + 1)}
          >
            Suivant
          </Button>
        </div>
      )}
    </div>
  );
}
