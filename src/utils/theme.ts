export type AppTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'taxbook_theme';

export function getInitialTheme(): AppTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Ігноруємо помилки доступу до localStorage
  }
  return 'light';
}

export function applyThemeToDocument(theme: AppTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ігноруємо помилки доступу до localStorage
  }
}
