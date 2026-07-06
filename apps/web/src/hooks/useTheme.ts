import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { selectTheme, setTheme as setThemeAction } from '../store/slices/authSlice';

export function useTheme() {
  const isDark = useAppSelector(selectTheme) === 'dark';
  const dispatch = useAppDispatch();

  const setDark = (value: boolean) => {
    const theme = value ? 'dark' : 'light';
    dispatch(setThemeAction(theme));
    localStorage.setItem('fury-theme', theme);
  };

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return { isDark, setDark };
}