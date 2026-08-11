import { AppLayout } from '@/components';
import { CalendarView } from './components/CalendarView';

export function CalendarioPage() {
  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <CalendarView />
      </div>
    </AppLayout>
  );
}
