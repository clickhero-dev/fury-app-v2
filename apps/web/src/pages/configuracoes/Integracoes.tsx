import { AppLayout, PageHeader, ErrorBoundary } from '@/components';
import { IntegracoesContent } from './IntegracoesContent';

export function Integracoes() {
  return (
    <ErrorBoundary>
      <AppLayout>
        <div className="space-y-8">
          <PageHeader
            title="Integrações"
            description="Gerencie suas contas de anúncios conectadas"
          />
          <IntegracoesContent />
        </div>
      </AppLayout>
    </ErrorBoundary>
  );
}
