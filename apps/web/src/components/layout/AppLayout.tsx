import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import type { ShellContext } from './AuthenticatedShell';

interface AppLayoutProps {
  /** Conteúdo principal da página renderizado abaixo do header. */
  children: ReactNode;
  /**
   * Conteúdo fixado abaixo do header principal (ex: filtros, tabs de período).
   * Fica sticky abaixo do header em `top-14`.
   */
  header?: ReactNode;
  /** Classes CSS adicionais para a área de conteúdo. */
  className?: string;
}

/**
 * Layout padrão de página autenticada da aplicação FURY.
 *
 * Estrutura:
 * 1. **Header fixo (sticky top-0):** botão de menu mobile e logo mobile.
 * 2. **Sub-header opcional (sticky top-14):** área para filtros ou tabs
 *    passados via prop `header`.
 * 3. **Área de conteúdo:** centralizada com `max-w-7xl` e padding responsivo.
 *
 * Integração com `AuthenticatedShell`:
 * - Obtém `setMobileOpen` via `useOutletContext` para controlar a sidebar mobile.
 * - Se usado fora do `AuthenticatedShell`, o botão de menu é silenciosamente ignorado.
 *
 * @example
 * // Uso básico em uma página
 * export function Dashboard() {
 *   return (
 *     <AppLayout header={<PeriodSelector />}>
 *       <MetricCard />
 *     </AppLayout>
 *   );
 * }
 */
export function AppLayout({ children, header, className }: AppLayoutProps) {
  const context = useOutletContext<ShellContext | null>();
  const setMobileOpen = context?.setMobileOpen ?? (() => {});

  return (
    <main className="flex-1 min-w-0 transition-all duration-300">
      {/* Header principal — fixo no topo */}
      <div className="flex items-center h-14 px-4 border-b border-border bg-background sticky top-0 z-20">
        {/* Botão de menu — visível apenas no mobile */}
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden p-2 rounded-lg text-text-secondary hover:bg-surface-secondary transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="md:hidden ml-3 font-bold text-text-primary tracking-wider">FURY</span>
        <div className="flex-1" />
      </div>

      {/* Sub-header opcional — sticky abaixo do header principal */}
      {header && (
        <div className="border-b border-border bg-surface sticky top-14 z-10">
          <div className="p-6">{header}</div>
        </div>
      )}

      {/* Área de conteúdo centralizada */}
      <div className={`p-6 lg:p-8 overflow-auto ${className || ''}`}>
        <div className="max-w-7xl mx-auto">{children}</div>
      </div>
    </main>
  );
}