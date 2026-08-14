import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Título principal da página. */
  title: string;
  /** Subtítulo ou descrição exibida abaixo do título. */
  description?: string;
  /** Botões ou ações exibidos à direita do título (ex: botão "Nova campanha"). */
  actions?: ReactNode;
  /** Conteúdo adicional renderizado abaixo do cabeçalho (ex: filtros, tabs). */
  children?: ReactNode;
  titleClassName?: string; 
}

/**
 * Cabeçalho padrão de página da aplicação.
 *
 * Exibe título, descrição opcional, ações à direita e conteúdo extra abaixo.
 * Usado no topo de todas as páginas autenticadas para manter consistência visual.
 *
 * @example
 * // Simples
 * <PageHeader title="Campanhas" description="Gerencie suas campanhas ativas" />
 *
 * @example
 * // Com ação e conteúdo extra
 * <PageHeader
 *   title="Campanhas"
 *   description="Gerencie suas campanhas ativas"
 *   actions={<Button>Nova campanha</Button>}
 * >
 *   <PeriodSelector />
 * </PageHeader>
 */
export function PageHeader({ 
  title, 
  description, 
  actions, 
  children,
  titleClassName = "text-2xl font-bold text-[#ECEDEF]" // Mantém a regra do título por padrão
}: PageHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className={titleClassName}>{title}</h1>
          {description && (
            <p className="text-xs sm:text-sm text-text-secondary leading-tight">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}