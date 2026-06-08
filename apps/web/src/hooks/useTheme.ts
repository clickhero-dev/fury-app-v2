import { useState, useEffect } from 'react';

export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => {
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
