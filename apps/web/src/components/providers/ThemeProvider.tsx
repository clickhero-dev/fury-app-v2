import { useEffect } from 'react';
import { useAppSelector } from '@/store/hooks';
import { selectTheme } from '@/store/slices/authSlice';

/**
 * Aplica o tema globalmente no <html>, dirigido ÚNICAMENTE pelo estado do Redux
 * (authSlice.theme). Elimina o mecanismo duplicado por Context que concorria com o Redux.
 *
 * Convenção aplicada (casando com o CSS em index.css):
 *  - Classe `.dark`  -> aciona o Tailwind `dark:` (@custom-variant dark).
 *  - data-theme="escuro"/"claro" -> aciona os blocos de variáveis .dark/[data-theme].
 *  - colorScheme     -> chrome nativo (scrollbar, etc.).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useAppSelector(selectTheme);

  useEffect(() => {
    const html = document.documentElement;

    if (theme === 'dark') {
      html.classList.add('dark');
      html.setAttribute('data-theme', 'escuro');
      html.style.colorScheme = 'dark';
    } else {
      html.classList.remove('dark');
      html.setAttribute('data-theme', 'claro');
      html.style.colorScheme = 'light';
    }
  }, [theme]);

  return <>{children}</>;
}