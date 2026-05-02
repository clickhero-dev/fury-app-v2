import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: keyof T;
  label: string;
  render?: (value: T[keyof T], row: T) => ReactNode;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField,
  isLoading = false,
  isEmpty = false,
  emptyMessage = 'Nenhum dado disponível',
  className,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className={cn('bg-surface rounded-xl border border-border p-8', className)}>
        <div className="flex items-center justify-center gap-3">
          <div className="w-4 h-4 bg-accent rounded-full animate-bounce" />
          <span className="text-text-secondary">Carregando...</span>
        </div>
      </div>
    );
  }

  if (isEmpty || data.length === 0) {
    return (
      <div className={cn('bg-surface rounded-xl border border-border p-8', className)}>
        <div className="flex items-center justify-center py-12">
          <span className="text-text-secondary">{emptyMessage}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('bg-surface rounded-xl border border-border overflow-hidden', className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-secondary">
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={cn(
                    'px-6 py-4 text-left font-semibold text-text-secondary text-sm',
                    column.align === 'center' && 'text-center',
                    column.align === 'right' && 'text-right'
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr
                key={String(row[keyField])}
                className={cn(
                  'border-b border-border hover:bg-surface-secondary transition-colors',
                  index === data.length - 1 && 'border-b-0'
                )}
              >
                {columns.map((column) => (
                  <td
                    key={String(column.key)}
                    className={cn(
                      'px-6 py-4 text-text-primary text-sm',
                      column.align === 'center' && 'text-center',
                      column.align === 'right' && 'text-right'
                    )}
                  >
                    {column.render
                      ? column.render(row[column.key], row)
                      : String(row[column.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
