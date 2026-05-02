import type { ReactNode } from 'react';
import { useState } from 'react';
import { Sidebar } from '../Sidebar';

interface AppLayoutProps {
  children: ReactNode;
  header?: ReactNode;
  className?: string;
}

export function AppLayout({
  children,
  header,
  className,
}: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />

      <main className="flex-1 transition-all duration-300">
        {header && (
          <div className="border-b border-border bg-surface sticky top-0 z-10">
            <div className="p-6">
              {header}
            </div>
          </div>
        )}

        <div className={`p-6 lg:p-8 overflow-auto ${className || ''}`}>
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
