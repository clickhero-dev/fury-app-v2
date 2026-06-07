import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { UserMenu } from '../UserMenu';
import { useSubscription } from '@/hooks/useBilling';
import type { ShellContext } from './AuthenticatedShell';

interface AppLayoutProps {
  children: ReactNode;
  header?: ReactNode;
  className?: string;
}

export function AppLayout({ children, header, className }: AppLayoutProps) {
  const { setMobileOpen } = useOutletContext<ShellContext>();
  const { data: subscription } = useSubscription();
  const planLabel =
    subscription?.status !== 'cancelled' && subscription?.status !== 'inactive'
      ? subscription?.plan?.name?.toUpperCase() ?? null
      : null;

  return (
    <main className="flex-1 min-w-0 transition-all duration-300">
      <div className="flex items-center h-14 px-4 border-b border-border bg-white sticky top-0 z-20">
        <button
          onClick={() => setMobileOpen(true)}
          className="md:hidden p-2 rounded-lg text-text-secondary hover:bg-surface-secondary transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="md:hidden ml-3 font-bold text-text-primary tracking-wider">FURY</span>
        <div className="flex-1" />
        {planLabel && (
          <span className="text-xs font-bold text-white bg-black/30 px-2 py-0.5 rounded-full mr-2">
            {planLabel}
          </span>
        )}
        <UserMenu />
      </div>

      {header && (
        <div className="border-b border-border bg-surface sticky top-14 z-10">
          <div className="p-6">{header}</div>
        </div>
      )}

      <div className={`p-6 lg:p-8 overflow-auto ${className || ''}`}>
        <div className="max-w-7xl mx-auto">{children}</div>
      </div>
    </main>
  );
}
