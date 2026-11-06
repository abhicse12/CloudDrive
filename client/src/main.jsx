import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import './index.css';
import { ThemeProvider } from './theme/ThemeProvider.jsx';

// StrictMode runs extra checks in development only (e.g. renders twice to expose bugs).
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
