import { useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Sidebar } from '../Sidebar';

export type ShellContext = {
  setMobileOpen: (open: boolean) => void;
};

export function AuthenticatedShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const token = localStorage.getItem('token');

  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="flex min-h-screen bg-surface">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <Outlet context={{ setMobileOpen } satisfies ShellContext} />
    </div>
  );
}
