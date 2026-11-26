import { useEffect, useState } from 'react';
import { useUIStore } from '../store/uiStore';

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Resolves the user's theme preference and keeps the <html> class in sync. */
export function useThemeSync() {
  const theme = useUIStore((s) => s.theme);
  const [systemDark, setSystemDark] = useState(() => media().matches);

  useEffect(() => {
    const mq = media();
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const isDark = theme === 'dark' || (theme === 'system' && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);
}

export function useIsDark() {
  const theme = useUIStore((s) => s.theme);
  if (theme === 'system') return media().matches;
  return theme === 'dark';
}
