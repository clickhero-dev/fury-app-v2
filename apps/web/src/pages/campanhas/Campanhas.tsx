import { AppLayout } from '@/components';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { PainelCampanhas } from './PainelCampanhas';

export default function Campanhas() {
  return (
    <AppLayout>
      <ErrorBoundary>
        <div className="mx-auto w-full max-w-5xl px-6 pt-2 pb-8 text-[#ECEDEF] sm:px-10">
          <PainelCampanhas />
        </div>
      </ErrorBoundary>
    </AppLayout>
  );
}