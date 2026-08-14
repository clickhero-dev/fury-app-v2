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
 * Layout padrão de página autenticada da aplicação ady.
 */
export function AppLayout({ children, header, className }: AppLayoutProps) {
  const context = useOutletContext<ShellContext | null>();
  const setMobileOpen = context?.setMobileOpen ?? (() => {});

  return (
    <main className="flex-1 min-w-0 min-h-screen bg-background transition-all duration-300">
      {/* Header principal — visível no mobile */}
      <div className="flex items-center h-14 px-4 border-b border-border bg-surface sticky top-0 z-20 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg text-text-secondary hover:bg-surface-secondary transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="ml-3 font-bold text-text-primary tracking-wider text-lg">ady</span>
        <div className="flex-1" />
      </div>

      {/* Sub-header opcional — sticky abaixo do header principal */}
      {header && (
        <div className="border-b border-border bg-surface sticky top-0 md:top-0 z-10">
          <div className="p-4 md:p-6">{header}</div>
        </div>
      )}

      {/* Área de conteúdo que ocupa 100% da largura sem espaços brancos */}
      <div className={`p-4 md:p-6 lg:p-8 overflow-auto ${className || ''}`}>
        <div className="w-full mx-auto">{children}</div>
      </div>
    </main>
  );
}