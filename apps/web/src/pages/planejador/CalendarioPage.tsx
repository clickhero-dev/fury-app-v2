import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components';
import { CalendarView } from './components/CalendarView';

export function CalendarioPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link do FAB "Postar": /calendario?criar=post abre o fluxo de
  // postagem direto (o CalendarView consome via prop initialAction) e o
  // parâmetro sai da URL em seguida, para não reabrir em navegações após.
  const initialAction = searchParams.get('criar') === 'post' ? 'new-post' : null;

  useEffect(() => {
    if (initialAction) {
      setSearchParams({}, { replace: true });
    }
  }, [initialAction, setSearchParams]);

  return (
    <AppLayout>
      <div className="flex w-full items-start justify-center p-3 sm:p-4 md:min-h-[calc(100vh-3.5rem)]">
        <div className="w-full max-w-6xl">
          <CalendarView initialAction={initialAction} />
        </div>
      </div>
    </AppLayout>
  );
}