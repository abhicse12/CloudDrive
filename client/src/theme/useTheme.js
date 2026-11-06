import { use } from 'react';
import { ThemeContext } from './ThemeContext.js';

/** const { preference, resolvedTheme, setTheme } = useTheme(); */
export function useTheme() {
  const context = use(ThemeContext);
  if (!context) throw new Error('useTheme() must be used inside <ThemeProvider>');
  return context;
}
