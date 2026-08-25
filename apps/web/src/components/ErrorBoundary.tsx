import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureException } from '@/lib/posthog';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureException(error, {
      component_stack: info.componentStack,
      url: window.location.pathname,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-text-primary">Algo deu errado</h1>
            <p className="mt-3 text-text-secondary">
              Ocorreu um erro inesperado. Recarregue a página para continuar.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
