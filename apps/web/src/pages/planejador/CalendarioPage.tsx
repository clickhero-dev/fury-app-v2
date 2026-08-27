import { AppLayout } from '@/components';
import { CalendarView } from './components/CalendarView';

export function CalendarioPage() {
  return (
    <AppLayout>
      <div className="flex w-full items-start justify-center p-3 sm:p-4 md:min-h-[calc(100vh-3.5rem)]">
        <div className="w-full max-w-6xl">
          <CalendarView />
        </div>
      </div>
    </AppLayout>
  );
}