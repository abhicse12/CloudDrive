import { createContext } from 'react';

// Holds { preference, resolvedTheme, setTheme }. Provided by ThemeProvider.
export const ThemeContext = createContext(null);
