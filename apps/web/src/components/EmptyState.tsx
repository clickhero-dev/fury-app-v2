import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Ícone customizado exibido no topo. Se omitido, usa o ícone padrão de linhas. */
  icon?: ReactNode;
  /** Título principal do estado vazio. */
  title: string;
  /** Descrição explicando por que o estado está vazio e o que o usuário pode fazer. */
  description: string;
  /** Ação opcional exibida como botão abaixo da descrição. */
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Ícone padrão usado quando nenhum ícone customizado é fornecido.
 * Representa linhas de conteúdo ausente.
 */
const DefaultIcon = () => (
  <svg
    className="w-6 h-6"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--color-accent)"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 7h18M3 12h18M3 17h10" />
  </svg>
);

/**
 * Componente de estado vazio para listas e seções sem conteúdo.
 *
 * Exibe um ícone, título, descrição e opcionalmente um botão de ação
 * para guiar o usuário a criar o primeiro item ou resolver a ausência de dados.
 *
 * @example
 * // Sem ação
 * <EmptyState
 *   title="Nenhuma campanha encontrada"
 *   description="Crie sua primeira campanha para começar."
 * />
 *
 * @example
 * // Com ação
 * <EmptyState
 *   title="Nenhuma regra configurada"
 *   description="Adicione regras de automação para o FURY Engine."
 *   action={{ label: 'Criar regra', onClick: () => setOpen(true) }}
 * />
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mb-4">
        {icon ?? <DefaultIcon />}
      </div>

      <h3 className="text-[15px] font-semibold text-text-primary mb-1.5">{title}</h3>
      <p className="text-sm text-text-secondary max-w-[280px] leading-relaxed">{description}</p>

      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 px-4 py-2 bg-accent hover:bg-accent/90 text-white text-sm font-medium rounded-lg transition-colors duration-150"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export default EmptyState;