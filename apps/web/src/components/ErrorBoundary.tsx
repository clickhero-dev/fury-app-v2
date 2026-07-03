import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** Conteúdo alternativo exibido em caso de erro. Se omitido, usa o fallback padrão. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Componente de classe que captura erros de renderização em seus filhos
 * e exibe uma interface de fallback em vez de quebrar toda a aplicação.
 *
 * Baseado na API de Error Boundaries do React. Deve envolver seções
 * críticas da UI para evitar que erros isolados derrubem toda a página.
 *
 * Comportamento:
 * - Captura erros de renderização, métodos de ciclo de vida e construtores filhos
 * - Loga o erro e o stack de componentes no console
 * - Exibe um `fallback` customizado se fornecido, ou uma UI padrão com botão "Tentar novamente"
 * - O botão "Tentar novamente" reseta o estado de erro e tenta renderizar novamente
 *
 * @example
 * // Com fallback padrão
 * <ErrorBoundary>
 *   <ComponenteQuePoderFalhar />
 * </ErrorBoundary>
 *
 * @example
 * // Com fallback customizado
 * <ErrorBoundary fallback={<p>Algo deu errado.</p>}>
 *   <ComponenteQuePoderFalhar />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  /**
   * Atualiza o estado quando um erro é capturado durante a renderização.
   * Chamado antes do re-render para exibir o fallback.
   */
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  /**
   * Loga o erro e o stack de componentes no console para diagnóstico.
   * Ideal para integrar com serviços de monitoramento como Sentry.
   */
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      // Exibe fallback customizado se fornecido
      if (this.props.fallback) return this.props.fallback;

      // Fallback padrão com mensagem de erro e botão de retry
      return (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <p className="text-lg font-semibold text-text-primary">
            Ocorreu um erro ao carregar esta página
          </p>
          <p className="text-sm text-text-secondary max-w-sm">
            {this.state.error?.message ?? 'Erro desconhecido'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="mt-2 px-4 py-2 text-sm font-medium rounded-lg border border-border text-text-primary hover:bg-surface-secondary transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}