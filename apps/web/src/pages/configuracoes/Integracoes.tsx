import { AppLayout, ErrorBoundary } from '@/components';
import { IntegracoesContent } from './IntegracoesContent';

export function Integracoes() {
  return (
    <ErrorBoundary>
      <AppLayout>
        <IntegracoesContent />
      </AppLayout>
    </ErrorBoundary>
  );
}