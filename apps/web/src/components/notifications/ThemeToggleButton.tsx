import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';

export function ThemeToggleButton() {
  const { isDark, setDark } = useTheme();
  return (
    <button
      type="button"
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
      onClick={() => setDark(!isDark)}
      className="ady-btn rounded-full border border-border bg-surface p-2 text-text-primary shadow-sm hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}
