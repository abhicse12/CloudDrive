import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  server: {
    port: 5173,
    strictPort: true, // fail loudly instead of silently moving to 5174 (CORS + cookies expect 5173)
    // The browser only ever talks to localhost:5173. Requests to /api/* are forwarded
    // to the Express API, so frontend and API share ONE origin: cookies just work and
    // no CORS is involved. In AWS, CloudFront does exactly the same job.
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: false, // keep the browser's Origin header for the API's CSRF origin check
      },
    },
  },

  preview: {
    port: 4173,
    proxy: { '/api': { target: API_TARGET, changeOrigin: false } },
  },

  // Vitest: run component tests in a simulated browser (jsdom).
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx}'],
    setupFiles: ['src/test-utils/setup.js'],
    // `npm run test:coverage -w client` → summary in the terminal, details in coverage/.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/test-utils/**', 'src/main.jsx'],
      reporter: ['text-summary', 'text', 'html', 'json-summary'],
    },
  },
});
