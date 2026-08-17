import { useEffect } from 'react';

export function ForceDarkMode({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;

    // 1. Pega o estado original do tema do usuário para restaurar depois
    const hadDarkClass = root.classList.contains('dark');
    const originalThemeAttr = root.getAttribute('data-theme');

    // 2. FORÇA O MODO ESCURO imediatamente ao entrar no Superadmin
    root.classList.add('dark');
    root.setAttribute('data-theme', 'escuro');
    root.style.colorScheme = 'dark';

    // 3. RESTAURA O TEMA ANTERIOR quando o Superadmin sair da tela
    return () => {
      if (!hadDarkClass) {
        root.classList.remove('dark');
      }
      if (originalThemeAttr) {
        root.setAttribute('data-theme', originalThemeAttr);
        root.style.colorScheme = hadDarkClass ? 'dark' : 'light';
      }
    };
  }, []);

  return <>{children}</>;
}