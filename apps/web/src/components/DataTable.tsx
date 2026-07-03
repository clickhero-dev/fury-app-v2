import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Definição de uma coluna da tabela.
 * @template T - Tipo do objeto de dados de cada linha
 */
interface Column<T> {
  /** Chave do campo no objeto de dados. */
  key: keyof T;
  /** Label exibido no cabeçalho da coluna. */
  label: string;
  /**
   * Função de renderização customizada para a célula.
   * Se omitida, exibe o valor convertido para string.
   *
   * @param value - Valor do campo na linha atual
   * @param row - Objeto completo da linha
   */
  render?: (value: T[keyof T], row: T) => ReactNode;
  /** Alinhamento do conteúdo da coluna. Padrão: 'left'. */
  align?: 'left' | 'center' | 'right';
}

/**
 * Props do componente DataTable.
 * @template T - Tipo do objeto de dados de cada linha
 */
interface DataTableProps<T> {
  /** Definição das colunas da tabela. */
  columns: Column<T>[];
  /** Array de dados a ser exibido. */
  data: T[];
  /** Campo usado como chave única para cada linha (equivalente ao `key` do React). */
  keyField: keyof T;
  /** Exibe estado de carregamento com animação. */
  isLoading?: boolean;
  /** Força exibição do estado vazio mesmo com dados. */
  isEmpty?: boolean;
  /** Mensagem exibida quando não há dados. Padrão: 'Nenhum dado disponível'. */
  emptyMessage?: string;
  className?: string;
  theadRowClassName?: string;
  thClassName?: string;
}

/**
 * Componente de tabela de dados genérica e reutilizável.
 *
 * Suporta tipagem genérica via TypeScript, renderização customizada por coluna,
 * estados de carregamento e vazio, e alinhamento de colunas.
 *
 * Estados possíveis:
 * - **Carregando** (`isLoading=true`) → exibe animação de bounce
 * - **Vazio** (`isEmpty=true` ou `data.length === 0`) → exibe `emptyMessage`
 * - **Com dados** → renderiza tabela completa com scroll horizontal em telas pequenas
 *
 * @template T - Tipo do objeto de dados. Deve ser um Record com chaves string.
 *
 * @example
 * <DataTable
 *   columns={[
 *     { key: 'name', label: 'Nome' },
 *     { key: 'status', label: 'Status', render: (v) => <StatusBadge status={v} /> },
 *     { key: 'spend', label: 'Gasto', align: 'right' },
 *   ]}
 *   data={campaigns}
 *   keyField="id"
 *   isLoading={isLoading}
 *   emptyMessage="Nenhuma campanha encontrada"
 * />
 */
export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField,
  isLoading = false,
  isEmpty = false,
  emptyMessage = 'Nenhum dado disponível',
  className,
  theadRowClassName,
  thClassName,
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
    <div className={cn('bg-surface rounded-xl border border-border overflow-x-auto', className)}>
      <table className="w-full min-w-[600px]">
        <thead>
          <tr className={cn('border-b border-border bg-surface-secondary', theadRowClassName)}>
            {columns.map((column) => (
              <th
                key={String(column.key)}
                className={cn(
                  'px-6 py-4 text-left font-semibold text-text-secondary text-sm',
                  column.align === 'center' && 'text-center',
                  column.align === 'right' && 'text-right',
                  thClassName
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
                index === data.length - 1 && 'border-b-0' // Remove borda da última linha
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
  );
}