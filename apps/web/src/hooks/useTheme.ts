import { useState, useEffect } from 'react';

/**
 * Hook para gerenciar o tema da interface (claro/escuro).
 *
 * - Persiste a preferência no localStorage sob a chave `fury-theme`.
 * - Aplica/remove a classe `dark` no elemento `<html>` para ativar o tema escuro via Tailwind.
 * - Inicializa com o tema salvo no localStorage, ou claro se não houver preferência.
 *
 * @returns `isDark` - `true` se o tema escuro está ativo
 * @returns `setDark` - Função para alternar o tema
 *
 * @example
 * const { isDark, setDark } = useTheme();
 *
 * <button onClick={() => setDark(!isDark)}>
 *   {isDark ? 'Modo claro' : 'Modo escuro'}
 * </button>
 */
export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    // Inicializa com a preferência salva no localStorage
    return localStorage.getItem('fury-theme') === 'dark';
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('fury-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('fury-theme', 'light');
    }
  }, [isDark]);

  return { isDark, setDark: setIsDark };
}