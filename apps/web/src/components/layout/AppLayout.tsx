import type { ReactNode } from 'react';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '../Sidebar';
import { UserMenu } from '../UserMenu';

interface AppLayoutProps {
  children: ReactNode;
  header?: ReactNode;
  className?: string;
}

export function AppLayout({ children, header, className }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-surface">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

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
          <UserMenu />
        </div>

        {header && (
          <div className="border-b border-border bg-surface sticky top-0 z-10">
            <div className="p-6">{header}</div>
          </div>
        )}

        <div className={`p-6 lg:p-8 overflow-auto ${className || ''}`}>
          <div className="max-w-7xl mx-auto">{children}</div>
        </div>
      </main>
    </div>
  );
}
