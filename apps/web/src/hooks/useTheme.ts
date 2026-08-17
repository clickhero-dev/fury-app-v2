import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectTheme, setTheme as setThemeAction } from '../store/slices/authSlice';

export function useTheme() {
  const theme = useAppSelector(selectTheme);
  const dispatch = useAppDispatch();

  // 1. Verifica a preferência do navegador
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  // 2. Se o usuário já salvou algo, usa o salvo. Se for o primeiro acesso, usa o do navegador.
  const isDark = theme ? theme === 'dark' : prefersDark;

  const setDark = (value: boolean) => {
    const newTheme = value ? 'dark' : 'light';
    dispatch(setThemeAction(newTheme));
    
    localStorage.setItem('fury-theme', newTheme);
    localStorage.setItem('ady-theme', value ? 'escuro' : 'claro');
  };

  useEffect(() => {
    const root = document.documentElement;

    if (isDark) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'escuro');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'claro');
      root.style.colorScheme = 'light';
    }
  }, [isDark]);

  return { isDark, setDark };
}