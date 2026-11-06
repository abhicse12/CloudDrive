import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App.jsx';
import './index.css';
import { createStore } from './store/index.js';
import { ThemeProvider } from './theme/ThemeProvider.jsx';

const store = createStore();

// StrictMode runs extra checks in development only (e.g. renders twice to expose bugs).
// Provider makes the Redux store available to every component below it.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </Provider>
  </StrictMode>,
);
