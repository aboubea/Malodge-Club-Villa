import { useState, ReactNode } from 'react';
import { ChevronUp, ChevronDown, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from './Button';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
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
  pagination,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const showActions = onEdit || onDelete;

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-[#242428]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#242428] bg-[#0A0A0B]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-4 py-3 text-left text-[11px] font-medium text-[#6B6B6F] uppercase tracking-wider whitespace-nowrap',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    col.sortable && 'cursor-pointer hover:text-[#F5F0EB] transition-colors select-none',
                    col.width && `w-[${col.width}]`,
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      sortDir === 'asc'
                        ? <ChevronUp size={12} />
                        : <ChevronDown size={12} />
                    )}
                  </span>
                </th>
              ))}
              {showActions && (
                <th className="px-4 py-3 text-right text-[11px] font-medium text-[#6B6B6F] uppercase tracking-wider w-24">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#242428]">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 bg-[#1A1A1D] rounded" />
                    </td>
                  ))}
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="h-4 bg-[#1A1A1D] rounded ml-auto w-16" />
                    </td>
                  )}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (showActions ? 1 : 0)}
                  className="px-4 py-12 text-center text-[#6B6B6F]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'bg-[#111113] transition-colors duration-100',
                    onRowClick && 'cursor-pointer hover:bg-[#1A1A1D]',
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-3 text-[#F5F0EB]',
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
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {onEdit && (
                          <button
                            onClick={() => onEdit(row)}
                            className="p-1.5 rounded-md text-[#6B6B6F] hover:text-[#C9A96E] hover:bg-[#1A1A1D] transition-colors"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => onDelete(row)}
                            className="p-1.5 rounded-md text-[#6B6B6F] hover:text-red-400 hover:bg-[#1A1A1D] transition-colors"
                          >
                            <Trash2 size={13} />
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
          <span className="text-xs text-[#6B6B6F] px-2">
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
