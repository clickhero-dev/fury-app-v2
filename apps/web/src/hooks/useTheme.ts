import { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectTheme, setTheme as setThemeAction } from '../store/slices/authSlice';

/**
 * Hook de tema baseado no Redux (fonte única de verdade).
 *
 * setDark persiste em `fury-theme` e atualiza o store; a aplicação no <html>
 * (classe .dark + data-theme + colorScheme) é feita pelo ThemeProvider global.
 */
export function useTheme() {
  const theme = useAppSelector(selectTheme);
  const dispatch = useAppDispatch();

  const isDark = theme === 'dark';

  const setDark = useCallback(
    (value: boolean) => {
      const newTheme = value ? 'dark' : 'light';
      dispatch(setThemeAction(newTheme));
      localStorage.setItem('fury-theme', newTheme);
    },
    [dispatch]
  );

  return { isDark, setDark };
}